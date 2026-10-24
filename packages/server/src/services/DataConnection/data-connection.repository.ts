import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { z } from 'zod';
import { Catalog, DataConnection, Identity, Keychain, Library, type Platform } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { defineDatabase } from '@/db/pool';
import { Repository, Transactional } from '@/db/repository';
import { AuditRepository } from '@/services/Audit/audit.repository';
import { ResourceRepository } from '@/services/Library/resource.repository';
import { json, type Table } from '@/db/table';
import type { IdentityDB } from '@/services/Identity/identity.db';
import { LibraryDB } from '@/services/Library/library.db';
import { EnsureResource } from '@/services/Library/ensure-resource';
import { isLive } from '@/db/liveness';

/** The `data_connection` schema: sources, syncs, sync runs. */
export namespace DataConnectionDB {

    export namespace Source {
        export const Row = z.object({
            rid:           DataConnection.Source.Rid,
            type:          z.literal('source'),
            definition_id:  DataConnection.Source.DefinitionId,
            config:         DataConnection.Source.Config,
            credential_rid: Keychain.Credential.Rid.nullable(),
            output_folder_rid: Library.Resource.Rid.nullable(),
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row, resource: LibraryDB.Resource.Row) => DataConnection.Source.Schema.parse({
            ...LibraryDB.Resource.toBase(resource),
            definitionId:    row.definition_id,
            config:          row.config,
            credentialRid:   row.credential_rid,
            outputFolderRid: row.output_folder_rid,
        });
    }

    export namespace Sync {
        export const Row = z.object({
            rid:                 DataConnection.Sync.Rid,
            source_rid:          DataConnection.Source.Rid,
            name:                z.string(),
            config:              DataConnection.Sync.Config,
            output_dataset_rid:  Catalog.Dataset.Rid,
            schedule:            z.string().nullable(),
            enabled:             z.boolean(),
            created_by:          Identity.User.Rid.nullable(),
            created_at:          z.date(),
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row) => DataConnection.Sync.Schema.parse({
            rid:              row.rid,
            sourceRid:        row.source_rid,
            name:             row.name,
            config:           row.config,
            outputDatasetRid: row.output_dataset_rid,
            schedule:         row.schedule,
            enabled:          row.enabled,
            createdBy:        row.created_by,
            createdAt:        row.created_at,
        });
    }

    export namespace SyncRun {
        export const Row = z.object({
            rid:            DataConnection.SyncRun.Rid,
            sync_rid:       DataConnection.Sync.Rid,
            status:         DataConnection.SyncRun.Status,
            transaction_rid: Catalog.Transaction.Rid.nullable(),
            state_from:     z.string().nullable(),
            state_to:       z.string().nullable(),
            row_count:      z.number().int().nullable(),
            error:          z.unknown().nullable(),
            trigger:        DataConnection.SyncRun.Trigger,
            triggered_by:   Identity.User.Rid.nullable(),
            started_at:     z.date(),
            heartbeat_at:   z.date(),
            finished_at:    z.date().nullable(),
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row) => DataConnection.SyncRun.Schema.parse({
            rid:            row.rid,
            syncRid:        row.sync_rid,
            status:         row.status,
            transactionRid: row.transaction_rid,
            stateFrom:      row.state_from,
            stateTo:        row.state_to,
            rowCount:       row.row_count,
            error:          row.error,
            trigger:        row.trigger,
            triggeredBy:    row.triggered_by,
            startedAt:      row.started_at,
            heartbeatAt:    row.heartbeat_at,
            finishedAt:     row.finished_at,
        });
    }

    export interface Tables {
        'data_connection.source':   Table<typeof Source.Row, 'type'>;
        'data_connection.sync':     Table<typeof Sync.Row, 'enabled' | 'created_at'>;
        'data_connection.sync_run': Table<typeof SyncRun.Row, 'status' | 'transaction_rid' | 'state_to' | 'row_count' | 'error' | 'started_at' | 'heartbeat_at' | 'finished_at'>;
    }

    export const database = defineDatabase<Tables & LibraryDB.ReadTables & IdentityDB.ReadTables>();
}

/**
 * Data Connection's one repository. Everything is grouped by what it touches:
 *
 *   repository.source.create / get
 *   repository.sync.create / get / listForSource / listScheduled
 *   repository.run.start / heartbeat / succeed / fail / latestState / list / stuck …
 *
 * Each group is a class in the namespace below (decorators need class methods),
 * so every method keeps its own @Transactional.
 */
@Injectable()
export class DataConnectionRepository {
    readonly source: DataConnectionRepository.Source;
    readonly sync   = new DataConnectionRepository.Sync();
    readonly run    = new DataConnectionRepository.SyncRun();

    constructor(resources: ResourceRepository, audit: AuditRepository) {
        this.source = new DataConnectionRepository.Source(resources, audit);
    }
}

export namespace DataConnectionRepository {

    export class Source extends Repository(DataConnectionDB.database) {

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

    export class Sync extends Repository(DataConnectionDB.database) {
        /** Source and output dataset are top-level, so @Transactional checks both are live. */
        @Transactional()
        async create(principal: Principal, sourceRid: DataConnection.Source.Rid, outputDatasetRid: Catalog.Dataset.Rid, values: {
            rid:      DataConnection.Sync.Rid;
            name:     string;
            config:   DataConnection.Sync.Config;            // already validated against the integration's sync Config
            schedule: string | null;
        }): Promise<DataConnectionDB.Sync.Row> {
            return this.trx
                .insertInto('data_connection.sync')
                .values({
                    rid:               values.rid,
                    source_rid:        sourceRid,
                    name:              values.name,
                    config:            json(values.config),
                    output_dataset_rid: outputDatasetRid,
                    schedule:          values.schedule,
                    created_by:        Principal.actorOf(principal),
                })
                .returningAll()
                .executeTakeFirstOrThrow();
        }

        @Transactional()
        async get(principal: Principal, rid: DataConnection.Sync.Rid): Promise<DataConnectionDB.Sync.Row | null> {
            const row = await this.trx
                .selectFrom('data_connection.sync')
                .selectAll()
                .where('rid', '=', rid)
                .executeTakeFirst();

            return row ?? null;
        }

        @Transactional()
        async listForSource(principal: Principal, sourceRid: DataConnection.Source.Rid): Promise<DataConnectionDB.Sync.Row[]> {
            return this.trx
                .selectFrom('data_connection.sync')
                .selectAll()
                .where('source_rid', '=', sourceRid)
                .orderBy('name')
                .execute();
        }

        /** Every enabled sync with a schedule — what the BullMQ job schedulers should mirror. */
        @Transactional('service')
        async listScheduled(principal: Principal.Service): Promise<Pick<DataConnectionDB.Sync.Row, 'rid' | 'schedule'>[]> {
            return this.trx
                .selectFrom('data_connection.sync')
                .select(['rid', 'schedule'])
                .where('enabled', '=', true)
                .where('schedule', 'is not', null)
                .execute();
        }
    }

    export class SyncRun extends Repository(DataConnectionDB.database) {

        @Transactional()
        async get(principal: Principal, rid: DataConnection.SyncRun.Rid): Promise<DataConnectionDB.SyncRun.Row | null> {
            const row = await this.trx
                .selectFrom('data_connection.sync_run')
                .selectAll()
                .where('rid', '=', rid)
                .executeTakeFirst();

            return row ?? null;
        }
        /** sync_run_one_running: a second concurrent run of the same sync fails here (23505 → Conflict). */
        @Transactional()
        async start(principal: Principal, values: {
            rid:         DataConnection.SyncRun.Rid;
            syncRid:      DataConnection.Sync.Rid;
            trigger:     DataConnection.SyncRun.Trigger;
            triggeredBy: Identity.User.Rid | null;
            stateFrom:   string | null;
        }): Promise<DataConnectionDB.SyncRun.Row> {
            return this.trx
                .insertInto('data_connection.sync_run')
                .values({
                    rid:          values.rid,
                    sync_rid:     values.syncRid,
                    trigger:      values.trigger,
                    triggered_by: values.triggeredBy,
                    state_from:   values.stateFrom,
                })
                .returningAll()
                .executeTakeFirstOrThrow();
        }

        @Transactional()
        async attachTransaction(principal: Principal, rid: DataConnection.SyncRun.Rid, transactionRid: Catalog.Transaction.Rid): Promise<void> {
            await this.trx
                .updateTable('data_connection.sync_run')
                .set({ transaction_rid: transactionRid, heartbeat_at: new Date() })
                .where('rid', '=', rid)
                .execute();
        }

        @Transactional()
        async heartbeat(principal: Principal, rid: DataConnection.SyncRun.Rid): Promise<void> {
            await this.trx
                .updateTable('data_connection.sync_run')
                .set({ heartbeat_at: new Date() })
                .where('rid', '=', rid)
                .where('status', '=', 'running')
                .execute();
        }

        @Transactional()
        async succeed(principal: Principal, rid: DataConnection.SyncRun.Rid, values: { stateTo: string | null; rowCount: number }): Promise<void> {
            await this.trx
                .updateTable('data_connection.sync_run')
                .set({ status: 'succeeded', state_to: values.stateTo, row_count: values.rowCount, finished_at: new Date() })
                .where('rid', '=', rid)
                .where('status', '=', 'running')
                .execute();
        }

        @Transactional()
        async fail(principal: Principal, rid: DataConnection.SyncRun.Rid, error: { reason: string; message?: string }): Promise<void> {
            await this.trx
                .updateTable('data_connection.sync_run')
                .set({ status: 'failed', error: json(error), finished_at: new Date() })
                .where('rid', '=', rid)
                .where('status', '=', 'running')
                .execute();
        }

        /** What the next run starts from: state_to of the latest succeeded run. */
        @Transactional()
        async latestState(principal: Principal, syncRid: DataConnection.Sync.Rid): Promise<string | null> {
            const row = await this.trx
                .selectFrom('data_connection.sync_run')
                .select('state_to')
                .where('sync_rid', '=', syncRid)
                .where('status', '=', 'succeeded')
                .orderBy('started_at', 'desc')
                .limit(1)
                .executeTakeFirst();

            return row?.state_to ?? null;
        }

        @Transactional()
        async list(principal: Principal, syncRid: DataConnection.Sync.Rid, limit = 50): Promise<DataConnectionDB.SyncRun.Row[]> {
            return this.trx
                .selectFrom('data_connection.sync_run')
                .selectAll()
                .where('sync_rid', '=', syncRid)
                .orderBy('started_at', 'desc')
                .limit(limit)
                .execute();
        }

        /** Running, but no heartbeat for `minutes` — the worker is gone. */
        @Transactional('service')
        async stuck(principal: Principal.Service, minutes: number): Promise<(DataConnectionDB.SyncRun.Row & { output_dataset_rid: Catalog.Dataset.Rid })[]> {
            return this.trx
                .selectFrom('data_connection.sync_run as r')
                .innerJoin('data_connection.sync as s', 's.rid', 'r.sync_rid')
                .selectAll('r')
                .select('s.output_dataset_rid')                 // a transaction is addressed through its dataset
                .where('r.status', '=', 'running')
                .where('r.heartbeat_at', '<', sql<Date>`now() - make_interval(mins => ${minutes})`)
                .execute();
        }
    }
}
