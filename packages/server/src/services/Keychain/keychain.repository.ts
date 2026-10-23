import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Identity, Keychain, Library } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { requireAffected } from '@/db/errors';
import { defineDatabase } from '@/db/pool';
import { Repository, Transactional } from '@/db/repository';
import type { Table } from '@/db/table';
import type { IdentityDB } from '@/services/Identity/identity.db';
import { LibraryDB } from '@/services/Library/library.db';
import { EnsureResource } from '@/services/Library/ensure-resource';
import { ResourceRepository } from '@/services/Library/resource.repository';
import { isLive } from '@/db/liveness';

/** The `keychain` schema: credentials, encrypted at rest. */
export namespace KeychainDB {

    export namespace Credential {
        export const Row = z.object({
            rid:         Keychain.Credential.Rid,
            type:        z.literal('credential'),
            template_id: Keychain.Credential.Template.Id,
            blob:        Keychain.Credential.Blob,
            updated_by:  Identity.User.Rid.nullable(),
            updated_at:  z.date(),
        });
        export type Row = z.infer<typeof Row>;

        /** The blob stays behind — it never reaches the API's domain model. */
        export const toDomain = (row: Pick<Row, 'template_id'>, resource: LibraryDB.Resource.Row) => Keychain.Credential.Schema.parse({
            ...LibraryDB.Resource.toBase(resource),
            templateId: row.template_id,
        });
    }

    export interface Tables {
        'keychain.credential': Table<typeof Credential.Row, 'type' | 'updated_at'>;
    }

    export const database = defineDatabase<Tables & LibraryDB.ReadTables & IdentityDB.ReadTables>();
}

/** A credential with its blob — what the service decrypts or hands on encrypted; never returned by the API as is. */
export type StoredCredential = { credential: Keychain.Credential.Schema; blob: Keychain.Credential.Blob };

@Injectable()
export class KeychainRepository extends Repository(KeychainDB.database) {

    constructor(readonly resources: ResourceRepository) {          // @EnsureResource's
        super();
    }

    /** Library row (via @EnsureResource) + credential row, in one transaction. */
    @Transactional()
    @EnsureResource('credential')
    async create(principal: Principal, values: {
        rid:         Keychain.Credential.Rid;
        name:        string;
        description: string | null;
        parentRid:   Library.Resource.Rid;
        templateId:  Keychain.Credential.Template.Id;
        blob:        Keychain.Credential.Blob;
    }): Promise<Keychain.Credential.Schema> {
        const row = await this.trx
            .insertInto('keychain.credential')
            .values({
                rid:         values.rid,
                template_id: values.templateId,
                blob:        values.blob,
                updated_by:  Principal.actorOf(principal),
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        return KeychainDB.Credential.toDomain(row, this.resource);
    }

    /** Live only: @Transactional checks the credential and its ancestors aren't trashed. */
    @Transactional()
    async get(principal: Principal, rid: Keychain.Credential.Rid): Promise<StoredCredential | null> {
        const row = await this.trx
            .selectFrom('keychain.credential as c')
            .innerJoin('library.resource as r', 'r.rid', 'c.rid')
            .selectAll('r')
            .select(['c.template_id', 'c.blob'])
            .where('c.rid', '=', rid)
            .executeTakeFirst();

        if (!row)
            return null;

        const { template_id, blob, ...resource } = row;

        return { credential: KeychainDB.Credential.toDomain({ template_id }, resource), blob };
    }

    /** Every live credential the user can discover (RLS), across projects; the service filters again with Gatekeeper. */
    @Transactional()
    async list(principal: Principal, templateId?: Keychain.Credential.Template.Id): Promise<Keychain.Credential.Schema[]> {
        let query = this.trx
            .selectFrom('keychain.credential as c')
            .innerJoin('library.resource as r', 'r.rid', 'c.rid')
            .selectAll('r')
            .select('c.template_id')
            .where(isLive('r.rid'))
            .orderBy('r.name');

        if (templateId)
            query = query.where('c.template_id', '=', templateId);

        const rows = await query.execute();

        return rows.map(({ template_id, ...resource }) => KeychainDB.Credential.toDomain({ template_id }, resource));
    }

    @Transactional()
    async setBlob(principal: Principal, rid: Keychain.Credential.Rid, blob: Keychain.Credential.Blob): Promise<void> {
        requireAffected(await this.trx
            .updateTable('keychain.credential')
            .set({ blob, updated_by: Principal.actorOf(principal), updated_at: new Date() })
            .where('rid', '=', rid)
            .executeTakeFirstOrThrow());
    }
}
