import { Injectable } from '@nestjs/common';
import { DataConnection, Keychain, Library, type Platform } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { json } from '@/db/table';
import { isLive } from '@/db/liveness';
import { AuditRepository } from '@/services/Audit/audit.repository';
import { EnsureResource } from '@/services/Library/ensure-resource';
import { ResourceRepository } from '@/services/Library/resource.repository';
import { DataConnectionDB } from '../data-connection.db';

/** data_connection.source (and its library row). Reached through DataConnectionRepository. */
@Injectable()
export class SourceRepository extends Repository(DataConnectionDB.database) {

    constructor(
        readonly resources:     ResourceRepository,          // @EnsureResource's
        private readonly audit: AuditRepository,
    ) {
        super();
    }

    /** Library row (via @EnsureResource) + source row, in one transaction. */
    @Transactional()
    @EnsureResource('source')
    async create(principal: Principal, values: {
        rid:         DataConnection.Source.Rid;
        name:        string;
        description: string | null;
        parentRid:   Library.Resource.Rid;
        definitionId:  DataConnection.Source.DefinitionId;
        config:        DataConnection.Source.Config;          // already validated against the definition
        credentialRid: Keychain.Credential.Rid | null;        // already checked: live, readable, of the definition's template
        outputFolderRid: Library.Resource.Rid | null;         // already checked: a live project or folder the user can see
    }): Promise<DataConnection.Source.Schema> {
        const source = await this.trx
            .insertInto('data_connection.source')
            .values({
                rid:            values.rid,
                definition_id:  values.definitionId,
                config:         json(values.config),
                credential_rid: values.credentialRid,
                output_folder_rid: values.outputFolderRid,
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        return DataConnectionDB.Source.toDomain(source, this.resource);
    }

    /** Live sources only. */
    @Transactional()
    async get(principal: Principal, rid: DataConnection.Source.Rid): Promise<DataConnection.Source.Schema | null> {
        const row = await this.trx
            .selectFrom('data_connection.source as s')
            .innerJoin('library.resource as r', 'r.rid', 's.rid')
            .selectAll('r')
            .select(['s.definition_id', 's.config', 's.credential_rid', 's.output_folder_rid'])
            .where('s.rid', '=', rid)
            .where('r.trashed_at', 'is', null)
            .executeTakeFirst();

        if (!row)
            return null;

        const { definition_id, config, credential_rid, output_folder_rid, ...resource } = row;

        return DataConnectionDB.Source.toDomain({ rid, type: 'source', definition_id, config, credential_rid, output_folder_rid }, resource);
    }

    /** An app opening the source's page: it, and the audit `open`, in one transaction. Null: not there, or not theirs to see. */
    @Transactional('user')
    async open(principal: Principal.User, rid: DataConnection.Source.Rid, application: Platform.Application.Id): Promise<DataConnection.Source.Schema | null> {
        const source = await this.get(principal, rid);          // joins this transaction

        if (source)
            await this.audit.recordOpen(principal, { rid, type: 'source', application });   // joins this transaction

        return source;
    }

    /** Every live source the user can discover (RLS), across projects. */
    @Transactional()
    async list(principal: Principal): Promise<DataConnection.Source.Schema[]> {
        const rows = await this.trx
            .selectFrom('data_connection.source as s')
            .innerJoin('library.resource as r', 'r.rid', 's.rid')
            .selectAll('r')
            .select(['s.rid as source_rid', 's.definition_id', 's.config', 's.credential_rid', 's.output_folder_rid'])
            .where(isLive('r.rid'))
            .orderBy('r.name')
            .execute();

        return rows.map(({ source_rid, definition_id, config, credential_rid, output_folder_rid, ...resource }) =>
            DataConnectionDB.Source.toDomain({ rid: source_rid, type: 'source', definition_id, config, credential_rid, output_folder_rid }, resource));
    }
}
