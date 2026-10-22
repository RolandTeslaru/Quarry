import { BadRequestException, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { Keychain } from '@quarry/shared/domain';
import { Encryption } from '@quarry/shared/server/encryption';
import { System } from '@quarry/shared/server/system';
import { CREDENTIAL_TEMPLATES, credentialToWire, findCredentialTemplate, type CredentialTemplate } from '@quarry/integrations/definitions';
import { Principal } from '@/auth/principal';
import { GatekeeperService } from '@/services/Gatekeeper/gatekeeper.service';
import { SecurityGate } from '@/services/Gatekeeper/security-gate';
import { KeychainRepository, type StoredCredential } from './keychain.repository';

/**
 * Credentials — library resources whose values are one encrypted blob.
 *
 *   discover  see it exists (Keychain lists it)
 *   read      use it: name it in a source; runs and probes act as someone with read
 *   write     change its values, reveal them
 *   manage    share it (Gatekeeper grants)
 *
 * The server encrypts on write and decrypts only to reveal; everything else
 * (runs, probes) gets the blob, which the Data Connection worker decrypts.
 *
 * Rows are RLS's: discover to see one, write to create or change one. Reveal
 * and use are gated here — the blob sits on a row a discoverer can read, so
 * the database alone would let them through.
 */
@Injectable()
export class KeychainService implements OnModuleInit {

    private readonly log = System.log.withContext('Keychain');

    constructor(
        readonly gatekeeper:         GatekeeperService,
        private readonly repository: KeychainRepository,
    ) {}

    /** Without the key nothing can be stored or revealed — fail at boot, not on the first credential. */
    onModuleInit(): void {
        Encryption.assertConfigured();
    }

    /** Every template the deployment's integrations declare, with its form. */
    templates(): Keychain.Credential.Template.Schema[] {
        return Object.values(CREDENTIAL_TEMPLATES).map(credentialToWire);
    }

    /** Credentials the principal can discover (RLS), across projects. */
    async list(principal: Principal, templateId?: Keychain.Credential.Template.Id): Promise<Keychain.Credential.Schema[]> {
        return this.repository.list(principal, templateId);
    }

    /** Write on the project or folder it goes in (RLS). The values are validated against the template, then encrypted. */
    async create(principal: Principal, request: Keychain.API.Credential.Create.Request): Promise<Keychain.Credential.Schema> {
        const template = requireTemplate(request.templateId);

        return this.repository.create(principal, {
            rid:         Keychain.Credential.createRid(),
            name:        request.name,
            description: request.description,
            parentRid:   request.parentRid,
            templateId:  template.id,
            blob:        Encryption.encrypt(parseValues(template, request.values)),
        });
    }

    async get(principal: Principal, rid: Keychain.Credential.Rid): Promise<Keychain.Credential.Schema> {
        return (await this.require(principal, rid)).credential;
    }

    /** Replaces every value — write (RLS). */
    async updateValues(principal: Principal, rid: Keychain.Credential.Rid, values: Keychain.Credential.Values): Promise<void> {
        const { credential } = await this.require(principal, rid);
        const template = requireTemplate(credential.templateId);

        await this.repository.setBlob(principal, rid, Encryption.encrypt(parseValues(template, values)));
    }

    /** The decrypted values — editors and owners only, and logged. */
    @SecurityGate('write')
    async reveal(principal: Principal, rid: Keychain.Credential.Rid): Promise<Keychain.Credential.Values> {
        const { blob } = await this.require(principal, rid);

        this.log.info(`Credential ${rid} revealed by ${Principal.actorOf(principal) ?? 'the system'}`);

        return Encryption.decrypt(blob);
    }

    /**
     * For using it — a source naming it, a run or probe of that source: read on
     * the credential, and still encrypted. Data Connection hands it to the worker as is.
     */
    @SecurityGate('read')
    async getEncryptedBlob(principal: Principal, rid: Keychain.Credential.Rid): Promise<Keychain.Credential.Encrypted> {
        const { credential, blob } = await this.require(principal, rid);

        return { rid, templateId: credential.templateId, blob };
    }

    private async require(principal: Principal, rid: Keychain.Credential.Rid): Promise<StoredCredential> {
        const stored = await this.repository.get(principal, rid);

        if (!stored)
            throw new NotFoundException('Not found');

        return stored;
    }
}

function requireTemplate(id: Keychain.Credential.Template.Id): CredentialTemplate {
    const template = findCredentialTemplate(id);

    if (!template)
        throw new BadRequestException(`Unknown credential template '${id}'`);

    return template;
}

/** Parsed (defaults applied) against the template's Fields — what gets encrypted. */
function parseValues(template: CredentialTemplate, values: Keychain.Credential.Values): Keychain.Credential.Values {
    const parsed = template.Fields.safeParse(values);

    if (!parsed.success)
        throw new BadRequestException(`Invalid ${template.displayName} credential: ${z.prettifyError(parsed.error)}`);

    return parsed.data;
}
