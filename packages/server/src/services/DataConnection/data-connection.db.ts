import { z } from 'zod';
import { Catalog, DataConnection, Dataset, Identity, Keychain, Library } from '@quarry/shared/domain';
import type { Table } from '@/db/table';
import { defineDatabase } from '@/db/pool';
import type { IdentityDB } from '@/services/Identity/identity.db';
import { LibraryDB } from '@/services/Library/library.db';

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
            output_dataset_rid:  Dataset.Rid,
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
