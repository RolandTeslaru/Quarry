import { ForbiddenException, BadRequestException, ConflictException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { DataConnection, Identity, Keychain, Storage, type Platform, Library } from '@quarry/shared/domain';
import { findDefinition, SOURCE_DEFINITIONS_WIRE } from '@quarry/integrations/definitions';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@/auth/principal';
import { FileStorage } from '@/infra/file-storage';
import { QueueManager } from '@/infra/queue';
import { CatalogService } from '@/services/Catalog/catalog.service';
import { RealtimeService } from '@/services/Realtime/realtime.service';
import { GatekeeperService } from '@/services/Gatekeeper/gatekeeper.service';
import { KeychainService } from '@/services/Keychain/keychain.service';
import { LibraryService } from '@/services/Library/library.service';
import { SecurityGate } from '@/services/Gatekeeper/security-gate';
import { Audit } from '@/services/Audit/audit.decorator';
import { AuditService } from '@/services/Audit/audit.service';
import { DataConnectionDB } from './data-connection.db';
import { DataConnectionRepository } from './repository/data-connection.repository';

/** How long the server waits for the Data Connection worker to answer a source probe. */
const PROBE_TIMEOUT_MS = 15_000;

/**
 * Data Connection's one entry point, grouped by what it acts on:
 *
 *   dataConnection.source.create / get / test / explore / definitions
 *   dataConnection.sync.create / list / run / scheduled
 *   dataConnection.run.list · start / heartbeat / complete / fail / reap   (start → reap: the workers, through /internal)
 *
 * Each group is a class in the namespace below — decorators need class
 * methods — provided by Nest and injected here (forwardRef: the namespace is
 * declared after this class). Never decrypts a source's credential: anything
 * that touches a source system is asked of the Data Connection worker, which
 * gets the credential encrypted (KeychainService.getEncryptedBlob checks read on it).
 */
@Injectable()
export class DataConnectionService {

    constructor(
        @Inject(forwardRef(() => DataConnectionService.Sources)) readonly source: DataConnectionService.Sources,
        @Inject(forwardRef(() => DataConnectionService.Syncs))   readonly sync:   DataConnectionService.Syncs,
        @Inject(forwardRef(() => DataConnectionService.Runs))    readonly run:    DataConnectionService.Runs,
    ) {}
}

export namespace DataConnectionService {

    // ── sources ─────────────────────────────────────────────────────────

    @Injectable()
    export class Sources {

        private readonly log = System.log.withContext('DataConnection');

        constructor(
            readonly gatekeeper:           GatekeeperService,
            readonly audit:                AuditService,
            private readonly keychain:     KeychainService,
            private readonly library:      LibraryService,
            private readonly queueManager: QueueManager,
            private readonly repository:   DataConnectionRepository,
        ) {}

        /** Every source type, with its config forms as JSON Schema. */
        definitions(): Record<DataConnection.Source.DefinitionId, DataConnection.Source.Definition.Schema> {
            return SOURCE_DEFINITIONS_WIRE;
        }

        /**
         * The config is validated against its definition's zod Config here — the
         * shared request only knows it's a record. The credential must be of the
         * definition's template and usable by the creator (read, checked by
         * Keychain). Write on the parent is RLS's call on the insert.
         */
        async create(principal: Principal, request: DataConnection.API.Source.Create.Request): Promise<DataConnection.Source.Schema> {
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
                const credential = await this.keychain.getEncryptedBlob(principal, request.credentialRid);

                if (credential.templateId !== template.id)
                    throw new BadRequestException(`A ${definition.displayName} source needs a ${template.displayName} credential, not '${credential.templateId}'`);
            }

            // Its default output: a project or folder the user can see (live, discoverable — 404 otherwise).
            if (request.outputFolderRid) {
                const folder = await this.library.get(principal, request.outputFolderRid);

                if (!Library.Resource.CONTAINERS.includes(folder.type))
                    throw new BadRequestException('A source\'s output folder must be a project or folder');
            }

            return this.repository.source.create(principal, {
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

        async get(principal: Principal, rid: DataConnection.Source.Rid): Promise<DataConnection.Source.Schema> {
            return this.require(principal, rid);
        }

        /** An app opening the source's page — the open recorded with the read (audit). Only users open pages. */
        async open(principal: Principal, rid: DataConnection.Source.Rid, application: Platform.Application.Id): Promise<DataConnection.Source.Schema> {
            if (principal.type !== 'user')
                throw new ForbiddenException('Only users open pages');

            const source = await this.repository.source.open(principal, rid, application);

            if (!source)
                throw new NotFoundException('Not found');

            return source;
        }

        /** Sources the principal can discover (RLS). */
        async list(principal: Principal): Promise<DataConnection.Source.Schema[]> {
            return this.repository.source.list(principal);
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
        async credentialOf(principal: Principal, source: DataConnection.Source.Schema): Promise<Keychain.Credential.Encrypted | null> {
            return source.credentialRid ? this.keychain.getEncryptedBlob(principal, source.credentialRid) : null;
        }

        /** The live source the principal can discover (RLS), or 404. */
        async require(principal: Principal, rid: DataConnection.Source.Rid): Promise<DataConnection.Source.Schema> {
            const source = await this.repository.source.get(principal, rid);

            if (!source)
                throw new NotFoundException('Not found');

            return source;
        }
    }

    // ── syncs ───────────────────────────────────────────────────────────

    @Injectable()
    export class Syncs {

        constructor(
            readonly gatekeeper:           GatekeeperService,
            private readonly sources:      Sources,
            private readonly catalog:      CatalogService,
            private readonly queueManager: QueueManager,
            private readonly repository:   DataConnectionRepository,
        ) {}

        /**
         * Creates the output dataset (write on its folder: RLS) and the sync, then
         * mirrors the schedule into BullMQ. Gated on the source up front: the
         * dataset and the scheduler would otherwise exist before RLS refuses the sync row.
         */
        @SecurityGate('write')
        async create(principal: Principal, sourceRid: DataConnection.Source.Rid, request: DataConnection.API.Sync.Create.Request): Promise<DataConnection.Sync.Schema> {
            const source = await this.sources.require(principal, sourceRid);
            const config = validateSyncConfig(source, request.config);

            const dataset = await this.catalog.createDataset(principal, {
                parentRid:   request.output.parentRid,
                name:        request.output.name,
                description: `Raw copy written by sync "${request.name}"`,
            });

            const row = await this.repository.sync.create(principal, sourceRid, dataset.rid, {
                rid:      DataConnection.Sync.createRid(),
                name:     request.name,
                config,
                schedule: request.schedule,
            });

            if (row.schedule) {
                const queueDefinition = DataConnection.Queue.Sync.Definition;

                await this.queueManager.upsertScheduler(queueDefinition, row.rid, { pattern: row.schedule }, {
                    syncRid: row.rid, trigger: 'schedule', triggeredBy: null,
                });
            }

            return DataConnectionDB.Sync.toDomain(row);
        }

        /** Syncs are listed with discover on the source (RLS); 404 if the source is hidden. */
        async list(principal: Principal, sourceRid: DataConnection.Source.Rid): Promise<DataConnection.Sync.Schema[]> {
            await this.sources.require(principal, sourceRid);

            const rows = await this.repository.sync.listForSource(principal, sourceRid);

            return rows.map(DataConnectionDB.Sync.toDomain);
        }

        /** Queues a run now — a Redis job, so gated: write on the source and on the output dataset. Deduplicated per sync. */
        @SecurityGate('write')
        async run(principal: Principal, sourceRid: DataConnection.Source.Rid, syncRid: DataConnection.Sync.Rid): Promise<void> {
            const sync = await this.require(principal, sourceRid, syncRid);

            await this.gatekeeper.assert(principal, 'write', sync.output_dataset_rid);
            await this.catalog.get(principal, sync.output_dataset_rid);          // 404 if the output is trashed

            if (!sync.enabled)
                throw new BadRequestException('Sync is disabled');

            const queueDefinition = DataConnection.Queue.Sync.Definition;
            const job = { syncRid, trigger: 'manual' as const, triggeredBy: Principal.actorOf(principal) };

            await this.queueManager.add(queueDefinition, job, { deduplication: DataConnection.Queue.Sync.deduplication(syncRid) });
        }

        /** Every enabled sync with a schedule — the system worker mirrors them into BullMQ's job schedulers. */
        async scheduled(): Promise<{ rid: DataConnection.Sync.Rid; schedule: string }[]> {
            const rows = await this.repository.sync.listScheduled(Principal.SELF('sync.scheduled'));

            return rows.map((row) => ({ rid: row.rid, schedule: row.schedule! }));
        }

        /** The sync, if it belongs to this source and the principal can discover it (RLS) — or 404. */
        async require(principal: Principal, sourceRid: DataConnection.Source.Rid, syncRid: DataConnection.Sync.Rid): Promise<DataConnectionDB.Sync.Row> {
            const sync = await this.repository.sync.get(principal, syncRid);

            if (!sync || sync.source_rid !== sourceRid)
                throw new NotFoundException('Not found');

            return sync;
        }
    }

    // ── runs — history for users; the lifecycle for the workers, through /internal ─

    @Injectable()
    export class Runs {

        constructor(
            readonly gatekeeper:         GatekeeperService,
            private readonly sources:    Sources,
            private readonly syncs:      Syncs,
            private readonly catalog:    CatalogService,
            private readonly files:      FileStorage,
            private readonly repository: DataConnectionRepository,
            private readonly realtime:   RealtimeService,
        ) {}

        /**
         * A sync's run history, newest first. Gated, not left to RLS: a discoverer
         * would otherwise get a silently empty history instead of a 403.
         */
        @SecurityGate('read')
        async list(principal: Principal, sourceRid: DataConnection.Source.Rid, syncRid: DataConnection.Sync.Rid): Promise<DataConnection.SyncRun.Schema[]> {
            await this.syncs.require(principal, sourceRid, syncRid);

            const rows = await this.repository.run.list(principal, syncRid);

            return rows.map(DataConnectionDB.SyncRun.toDomain);
        }

        /**
         * Begins a run: records it and opens the output dataset's transaction. The
         * system loads the sync; from there the run acts for whoever pressed run
         * (manual) or the sync's creator (scheduled) — Gatekeeper checks that
         * delegate, so a user who lost access — to the output dataset or to the
         * source's credential — stops their runs here.
         */
        async start(job: DataConnection.API.Internal.StartRun.Request): Promise<DataConnection.API.Internal.StartRun.Response> {
            const sync = await this.repository.sync.get(Principal.SELF('sync.start'), job.syncRid);

            if (!sync || !sync.enabled)
                return { skipped: true };

            const principal = runPrincipal(job.triggeredBy, sync);
            const source = await this.repository.source.get(principal, sync.source_rid);

            if (!source)
                throw new NotFoundException(`Source ${sync.source_rid} of sync ${sync.rid} is missing or trashed`);

            // The integration decides from the sync's config whether a run replaces the view or appends to it.
            const transactionType = syncDefinition(source).transaction(sync.config);
            const stateFrom = await this.repository.run.latestState(principal, sync.rid);
            const runRid = DataConnection.SyncRun.createRid();

            await this.repository.run.start(principal, { rid: runRid, syncRid: sync.rid, trigger: job.trigger, triggeredBy: job.triggeredBy, stateFrom });
            await this.publish(runRid, sync);

            try {
                const credential = await this.sources.credentialOf(principal, source);
                const transaction = await this.catalog.transaction.open(principal, sync.output_dataset_rid, transactionType, { syncRid: sync.rid, syncRunRid: runRid });

                await this.repository.run.attachTransaction(principal, runRid, transaction.rid);

                return {
                    skipped:        false,
                    runRid,
                    datasetRid:     sync.output_dataset_rid,
                    transactionRid: transaction.rid,
                    source,
                    credential,
                    syncConfig:     sync.config,
                    state:          stateFrom,
                    destination:    this.files.url(this.catalog.transaction.storagePrefix(sync.output_dataset_rid, transaction.rid)),
                };
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);

                await this.repository.run.fail(Principal.SELF('sync.start'), runRid, { reason: 'error', message });
                await this.publish(runRid, sync);
                this.notifyFailure(job.triggeredBy, sync, message);

                throw error;
            }
        }

        async heartbeat(runRid: DataConnection.SyncRun.Rid): Promise<void> {
            await this.repository.run.heartbeat(Principal.SELF('sync.heartbeat'), runRid);
        }

        /**
         * The copy is done: registers what's actually under the transaction's prefix
         * (listed here, not taken from the worker — so nothing outside it can be
         * registered), with the worker's row counts and schema, then commits.
         */
        async complete(runRid: DataConnection.SyncRun.Rid, request: DataConnection.API.Internal.CompleteRun.Request): Promise<DataConnection.API.Internal.CompleteRun.Response> {
            const { run, sync } = await this.requireRunning(runRid);
            const principal = runPrincipal(run.triggered_by, sync);
            const datasetRid = sync.output_dataset_rid;
            const transactionRid = run.transaction_rid!;
            const prefix = this.catalog.transaction.storagePrefix(datasetRid, transactionRid);

            const changes = (await this.files.list(prefix))
                .filter((object) => Storage.File.formatOf(object.key) === 'parquet')
                .map((object) => ({
                    op:          'add' as const,
                    logicalPath: object.key.slice(`${datasetRid}/`.length),     // <transaction>/data_N.parquet — unique per transaction
                    format:      'parquet' as const,
                    key:         object.key,
                    bytes:       object.bytes,
                    rowCount:    request.rowCounts[object.key] ?? null,
                }));

            await this.catalog.transaction.registerChanges(principal, datasetRid, transactionRid, changes);
            await this.catalog.transaction.commit(principal, datasetRid, transactionRid, request.schema);
            await this.repository.run.succeed(principal, runRid, { stateTo: request.state, rowCount: request.rowCount });
            await this.publish(runRid, sync);

            return { transactionRid, files: changes.length };
        }

        /** Aborts the transaction and fails the run — as the system, so it works even if the delegate lost access. */
        async fail(runRid: DataConnection.SyncRun.Rid, message: string): Promise<void> {
            const self = Principal.SELF('sync.fail');
            const { run, sync } = await this.requireRunning(runRid);

            if (run.transaction_rid)
                await this.catalog.transaction.abort(self, sync.output_dataset_rid, run.transaction_rid);

            await this.repository.run.fail(self, runRid, { reason: 'error', message });
            await this.publish(runRid, sync);
            this.notifyFailure(run.triggered_by, sync, message);
        }

        /** Runs still `running` with a heartbeat older than `staleMinutes` lost their worker: fail them, abort their transactions. */
        async reap(staleMinutes: number): Promise<number> {
            const self = Principal.SELF('sync.reap');
            const stuck = await this.repository.run.stuck(self, staleMinutes);

            for (const run of stuck) {
                await this.repository.run.fail(self, run.rid, { reason: 'worker lost' });

                if (run.transaction_rid)
                    await this.catalog.transaction.abort(self, run.output_dataset_rid, run.transaction_rid);

                const sync = await this.repository.sync.get(self, run.sync_rid);

                await this.publish(run.rid, sync!);
                this.notifyFailure(run.triggered_by, sync!, 'The worker running it stopped responding.');
            }

            return stuck.length;
        }

        /** The run as it is now, to everyone on its source's channel (who can discover the source — the gateway checks). */
        private async publish(runRid: DataConnection.SyncRun.Rid, sync: DataConnectionDB.Sync.Row): Promise<void> {
            const run = await this.repository.run.get(Principal.SELF('sync.publish'), runRid);

            this.realtime.emitEvent({
                ...DataConnection.Event.create('data-connection:run:updated', { run: DataConnectionDB.SyncRun.toDomain(run!) }),
                channel: DataConnection.Event.getChannel(sync.source_rid),
            });
        }

        /** Tells whoever the run acted for — who pressed run, or the sync's creator for a scheduled run — on their own channel. */
        private notifyFailure(triggeredBy: Identity.User.Rid | null, sync: DataConnectionDB.Sync.Row, message: string): void {
            const userRid = triggeredBy ?? sync.created_by;

            if (!userRid)
                return;

            this.realtime.emitEvent({
                ...Identity.Event.create('identity:notification', {
                    level:       'error',
                    title:       `Sync "${sync.name}" failed`,
                    description: message,
                }),
                channel: Identity.Event.getChannel(userRid),
            });
        }

        private async requireRunning(runRid: DataConnection.SyncRun.Rid) {
            const self = Principal.SELF('sync.load');
            const run = await this.repository.run.get(self, runRid);

            if (!run)
                throw new NotFoundException('Not found');

            if (run.status !== 'running')
                throw new ConflictException(`Run is ${run.status}`);

            const sync = await this.repository.sync.get(self, run.sync_rid);

            return { run, sync: sync! };
        }
    }
}

// ── helpers ─────────────────────────────────────────────────────────────

/** What a sync of this source can copy — its integration's sync definition. */
function syncDefinition(source: DataConnection.Source.Schema) {
    const definition = findDefinition(source.definitionId);

    if (!definition)
        throw new BadRequestException(`Unknown source type '${source.definitionId}'`);

    return definition.sync;
}

/** A new sync's config, parsed (defaults applied) against its integration's sync Config. */
function validateSyncConfig(source: DataConnection.Source.Schema, config: DataConnection.Sync.Config): DataConnection.Sync.Config {
    const parsed = syncDefinition(source).Config.safeParse(config);

    if (!parsed.success)
        throw new BadRequestException(`Invalid sync config: ${z.prettifyError(parsed.error)}`);

    return parsed.data as DataConnection.Sync.Config;
}

/** Manual runs act for whoever pressed run; scheduled ones for the sync's creator. */
function runPrincipal(triggeredBy: DataConnection.SyncRun.Schema['triggeredBy'], sync: DataConnectionDB.Sync.Row): Principal {
    return Principal.onBehalfOf(triggeredBy ?? sync.created_by, `sync:${sync.rid}`);
}
