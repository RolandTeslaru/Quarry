import { z } from 'zod';
import { Foundations, LineageExplorer } from '@quarry/shared/domain';
import { defineDatabase } from '@quarry/platform-kernel/db/pool';
import type { Table } from '@quarry/platform-kernel/db/table';
import type { IdentityDB } from '@quarry/platform-kernel/services/Identity/identity.db';
import { LibraryDB } from '@quarry/platform-kernel/services/Library/library.db';

/** The `lineage_explorer` schema: saved explorations. */
export namespace LineageExplorerDB {

    export namespace Exploration {
        export const Row = z.object({
            rid:    LineageExplorer.Exploration.Rid,
            type:   z.literal('lineage-exploration'),
            branch: Foundations.Branch,
            nodes:  LineageExplorer.Exploration.Schema.shape.nodes,
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row, resource: LibraryDB.Resource.Row) => LineageExplorer.Exploration.Schema.parse({
            ...LibraryDB.Resource.toBase(resource),
            branch: row.branch,
            nodes:  row.nodes,
        });
    }

    export interface Tables {
        'lineage_explorer.exploration': Table<typeof Exploration.Row, 'type' | 'nodes'>;
    }

    export const database = defineDatabase<Tables & LibraryDB.ReadTables & IdentityDB.ReadTables>();
}
