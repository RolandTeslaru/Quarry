import { ForbiddenException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { DataConnection, Keychain, Library, type Platform } from '@quarry/shared/domain';
import { findDefinition, SOURCE_DEFINITIONS_WIRE } from '@quarry/integrations/definitions';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { QueueManager } from '@quarry/platform-kernel/infra/queue';
import { GatekeeperService } from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.service';
import { KeychainClient } from '@quarry/platform-kernel/microservice/clients';
import { LibraryService } from '@quarry/platform-kernel/services/Library/library.service';
import { SecurityGate } from '@quarry/platform-kernel/services/Gatekeeper/security-gate';
import { Audit } from '@quarry/platform-kernel/services/Audit/audit.decorator';
import { AuditService } from '@quarry/platform-kernel/services/Audit/audit.service';
import { SourceRepository } from './source.repository';

/** How long the server waits for the Data Connection worker to answer a source probe. */
const PROBE_TIMEOUT_MS = 15_000;

/**
 * Sources: create, get, open, list, and probes of the source system (test, explore, preview). Never
 * decrypts a source's credential: anything that touches a source system is asked of the Data
 * Connection worker, which gets the credential encrypted (Keychain's getEncryptedBlob checks read on it).
 */
@Injectable()
export class SourceService {

    private readonly log = System.log.withContext('DataConnection');

    constructor(
        readonly gatekeeper:           GatekeeperService,
        readonly audit:                AuditService,
        private readonly keychain:     KeychainClient,
        private readonly library:      LibraryService,
        private readonly queueManager: QueueManager,
        private readonly repository:   SourceRepository,
    ) {}

    /** Every source type, with its config forms as JSON Schema. */
    definitions(): Record<DataConnection.Source.DefinitionId, DataConnection.Source.Definition> {
        return SOURCE_DEFINITIONS_WIRE;
    }

    /**
     * The config is validated against its definition's zod Config here — the
     * shared request only knows it's a record. The credential must be of the
     * definition's template and usable by the creator (read, checked by
     * Keychain). Write on the parent is RLS's call on the insert.
     */
    async create(principal: Principal, request: DataConnection.API.Source.Create.Request): Promise<DataConnection.Source> {
        const definition = findDefinition(request.definitionId);

        if (!definition)
            throw new BadRequestException(`Unknown source type '${request.definitionId}'`);

        const config = definition.Config.safeParse(request.config);

        if (!config.success)
            throw new BadRequestException(`Invalid ${definition.displayName} config: ${z.prettifyError(config.error)}`);

        const template = definition.credential;

        if (template && !request.credentialRid)
            throw new BadRequestException(`A ${definition.displayName} source needs a ${template.displayName} credential`);

        if (!template && request.credentialRid)
            throw new BadRequestException(`A ${definition.displayName} source takes no credential`);

        if (template && request.credentialRid) {
            const credential = await this.keychain.getEncryptedBlob(principal, { credentialRid: request.credentialRid });

            if (credential.templateId !== template.id)
                throw new BadRequestException(`A ${definition.displayName} source needs a ${template.displayName} credential, not '${credential.templateId}'`);
        }

        // Its default output: a project or folder the user can see (live, discoverable — 404 otherwise).
        if (request.outputFolderRid) {
            const folder = await this.library.get(principal, request.outputFolderRid);

            if (!Library.Resource.CONTAINERS.includes(folder.type))
                throw new BadRequestException('A source\'s output folder must be a project or folder');
        }

        return this.repository.create(principal, {
            rid:           DataConnection.Source.createRid(),
            name:          request.name,
            description:   request.description,
            parentRid:     request.parentRid,
            definitionId:  definition.id,
            config:        config.data,
            credentialRid: request.credentialRid,
            outputFolderRid: request.outputFolderRid,
        });
    }

    async get(principal: Principal, rid: DataConnection.Source.Rid): Promise<DataConnection.Source> {
        return this.require(principal, rid);
    }

    /** An app opening the source's page — the open recorded with the read (audit). Only users open pages. */
    async open(principal: Principal, rid: DataConnection.Source.Rid, application: Platform.Application.Id): Promise<DataConnection.Source> {
        if (principal.type !== 'user')
            throw new ForbiddenException('Only users open pages');

        const source = await this.repository.open(principal, rid, application);

        if (!source)
            throw new NotFoundException('Not found');

        return source;
    }

    /** Sources the principal can discover (RLS). */
    async list(principal: Principal): Promise<DataConnection.Source[]> {
        return this.repository.list(principal);
    }

    /** Read on the source and on its credential — gated: a probe writes no row RLS could refuse. */
    @Audit('read', () => ({ op: 'test' }))
    @SecurityGate('read')
    async test(principal: Principal, rid: DataConnection.Source.Rid): Promise<DataConnection.API.Source.Test.Response> {
        const source = await this.require(principal, rid);
        const credential = await this.credentialOf(principal, source);

        const queueDefinition = DataConnection.Queue.SourceProbe.Definition;

        const result = await this.queueManager.request(queueDefinition, { op: 'test', source, credential }, PROBE_TIMEOUT_MS);
        const tested = result.op === 'test' ? { ok: result.ok, error: result.error } : { ok: false, error: 'Unexpected probe result' };

        if (!tested.ok)
            this.log.warning('Connection test failed', { sourceRid: rid, error: tested.error });

        return tested;
    }

    /** Read on the source and on its credential — gated, like test. */
    @Audit('read', () => ({ op: 'explore' }))
    @SecurityGate('read')
    async explore(principal: Principal, rid: DataConnection.Source.Rid): Promise<DataConnection.API.Source.Explore.Response> {
        const source = await this.require(principal, rid);
        const credential = await this.credentialOf(principal, source);

        const queueDefinition = DataConnection.Queue.SourceProbe.Definition;

        const result = await this.queueManager.request(queueDefinition, { op: 'explore', source, credential }, PROBE_TIMEOUT_MS);

        return { tables: result.op === 'explore' ? result.tables : [] };
    }

    /** A table's first rows, read live — gated and audited like explore. */
    @Audit('read', (table: DataConnection.Source.Table) => ({ op: 'preview', table: `${table.schema}.${table.name}` }))
    @SecurityGate('read')
    async previewTable(principal: Principal, rid: DataConnection.Source.Rid, table: DataConnection.Source.Table, limit: number): Promise<DataConnection.API.Source.PreviewTable.Response> {
        const source = await this.require(principal, rid);
        const credential = await this.credentialOf(principal, source);

        const queueDefinition = DataConnection.Queue.SourceProbe.Definition;

        const result = await this.queueManager.request(queueDefinition, { op: 'preview', source, credential, table, limit }, PROBE_TIMEOUT_MS);

        if (result.op !== 'preview')
            throw new BadRequestException('Unexpected probe result');

        return result.preview;
    }

    /** The source's credential, encrypted, for the worker — asserts the principal may use it (read). */
    async credentialOf(principal: Principal, source: DataConnection.Source): Promise<Keychain.Credential.Encrypted | null> {
        return source.credentialRid ? this.keychain.getEncryptedBlob(principal, { credentialRid: source.credentialRid }) : null;
    }

    /** The live source the principal can discover (RLS), or 404. */
    async require(principal: Principal, rid: DataConnection.Source.Rid): Promise<DataConnection.Source> {
        const source = await this.repository.get(principal, rid);

        if (!source)
            throw new NotFoundException('Not found');

        return source;
    }
}
