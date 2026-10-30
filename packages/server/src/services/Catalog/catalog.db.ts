import { z } from 'zod';
import { Catalog, Dataset as DatasetD, Foundations, Identity, Storage } from '@quarry/shared/domain';
import { defineDatabase } from '@/db/pool';
import type { Table } from '@/db/table';
import type { IdentityDB } from '@/services/Identity/identity.db';
import { LibraryDB } from '@/services/Library/library.db';

/** The `catalog` schema: datasets as versioned file sets. */
export namespace CatalogDB {

    export namespace Dataset {
        export const Row = z.object({
            rid:  DatasetD.Rid,
            type: z.literal('dataset'),
        });
        export type Row = z.infer<typeof Row>;

        /** The library fields + the catalog's own. */
        export const toDomain = (row: Row, resource: LibraryDB.Resource.Row, lastSequence: DatasetD.Sequence) =>
            DatasetD.Schema.parse({
                ...LibraryDB.Resource.toBase(resource),
                lastSequence,
            });
    }

    export namespace Branch {
        export const Row = z.object({
            dataset_rid:   DatasetD.Rid,
            name:          Foundations.Branch,
            last_sequence: DatasetD.Sequence,
            created_at:    z.date(),
        });
        export type Row = z.infer<typeof Row>;
    }

    export namespace Transaction {
        export const Row = z.object({
            rid:         Catalog.Transaction.Rid,
            dataset_rid: DatasetD.Rid,
            branch:      Foundations.Branch,
            type:        Catalog.Transaction.Type,
            status:      Catalog.Transaction.Status,
            sequence:    DatasetD.Sequence.nullable(),
            schema:      Catalog.ColumnSchema.Schema.nullable(),
            provenance:  z.record(z.string(), z.unknown()),
            started_by:  Identity.User.Rid.nullable(),
            started_at:  z.date(),
            finished_at: z.date().nullable(),
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row) => Catalog.Transaction.Schema.parse({
            rid:        row.rid,
            datasetRid: row.dataset_rid,
            branch:     row.branch,
            type:       row.type,
            status:     row.status,
            sequence:   row.sequence,
            schema:     row.schema,
            provenance: row.provenance,
            startedBy:  row.started_by,
            startedAt:  row.started_at,
            finishedAt: row.finished_at,
        });
    }

    export namespace TransactionChange {
        export const Row = z.object({
            transaction_rid: Catalog.Transaction.Rid,
            logical_path:    z.string(),
            op:              Catalog.Transaction.FileChange.Op,
            format:          Storage.File.Format.nullable(),
            key:             Storage.File.Key.nullable(),
            bytes:           z.number().int().nullable(),
            row_count:       z.number().int().nullable(),
        });
        export type Row = z.infer<typeof Row>;

        export const fromDomain = (transactionRid: Catalog.Transaction.Rid, change: Catalog.Transaction.FileChange.Schema): Row =>
            change.op === 'remove'
                ? { transaction_rid: transactionRid, logical_path: change.logicalPath, op: 'remove', format: null, key: null, bytes: null, row_count: null }
                : { transaction_rid: transactionRid, logical_path: change.logicalPath, op: 'add', format: change.format, key: change.key, bytes: change.bytes, row_count: change.rowCount };

        /** An 'add' row as the stored file it points at. */
        export const toFile = (row: Row): Storage.File.Schema => Storage.File.Schema.parse({
            format:   row.format,
            key:      row.key,
            bytes:    row.bytes,
            rowCount: row.row_count,
        });
    }

    export interface Tables {
        'catalog.dataset':          Table<typeof Dataset.Row, 'type'>;
        'catalog.branch':           Table<typeof Branch.Row, 'last_sequence' | 'created_at'>;
        'catalog.transaction':      Table<typeof Transaction.Row, 'status' | 'sequence' | 'schema' | 'provenance' | 'started_at' | 'finished_at'>;
        'catalog.transaction_change': Table<typeof TransactionChange.Row>;
    }

    export const database = defineDatabase<Tables & LibraryDB.ReadTables & IdentityDB.ReadTables>();
}
