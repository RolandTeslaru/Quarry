import { z } from 'zod';
import { Catalog, DataConnection, Dataset, Identity, Keychain, Library } from '@quarry/shared/domain';
import type { Table } from '@quarry/platform-kernel/db/table';
import { defineDatabase } from '@quarry/platform-kernel/db/pool';
import type { IdentityDB } from '@quarry/platform-kernel/services/Identity/identity.db';
import { LibraryDB } from '@quarry/platform-kernel/services/Library/library.db';

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

    export interface Tables {
        'data_connection.source':   Table<typeof Source.Row, 'type'>;
        'data_connection.sync':     Table<typeof Sync.Row, 'enabled' | 'created_at'>;
    }

    export const database = defineDatabase<Tables & LibraryDB.ReadTables & IdentityDB.ReadTables>();
}
