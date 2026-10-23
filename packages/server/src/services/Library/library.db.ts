import { z } from 'zod';
import { Identity, Library } from '@quarry/shared/domain';
import { defineDatabase } from '@/db/pool';
import type { ReadOnly, Table } from '@/db/table';
import type { IdentityDB } from '@/services/Identity/identity.db';

/** The `library` schema: resource identity and the tree. A foundation schema — every service may read it. */
export namespace LibraryDB {

    export namespace Resource {
        export const Row = z.object({
            rid:         Library.Resource.Rid,
            type:        Library.Resource.Type,
            name:        z.string(),
            description: z.string().nullable(),
            parent_rid:  Library.Resource.Rid.nullable(),
            created_by:  Identity.User.Rid.nullable(),
            created_at:  z.date(),
            updated_at:  z.date(),
            trashed_by:  Identity.User.Rid.nullable(),
            trashed_at:  z.date().nullable(),
        });
        export type Row = z.infer<typeof Row>;

        /** The shared fields every subtype's domain model starts from. */
        export const toBase = (row: Row): Library.Resource.Base => ({
            rid:         row.rid,
            type:        row.type,
            name:        row.name,
            description: row.description,
            parentRid:   row.parent_rid,
            createdBy:   row.created_by,
            createdAt:   row.created_at,
            updatedAt:   row.updated_at,
            trashedAt:   row.trashed_at,
        });

        export const toProject = (row: Row) => Library.Project.Schema.parse(toBase(row));
        export const toFolder  = (row: Row) => Library.Folder.Schema.parse(toBase(row));
    }

    // Seeded by the migration — never written by code.
    export namespace ResourceType {
        export const Row = z.object({
            type:             Library.Resource.Type,
            is_container:     z.boolean(),
            show_in_explorer: z.boolean(),
        });
        export type Row = z.infer<typeof Row>;
    }

    // Closure table — trigger-maintained, never written by code.
    export namespace ResourceAncestor {
        export const Row = z.object({
            resource_rid: Library.Resource.Rid,
            ancestor_rid: Library.Resource.Rid,
            depth:       z.number().int(),
        });
        export type Row = z.infer<typeof Row>;
    }

    export interface Tables {
        'library.resource_type':     ReadOnly<Table<typeof ResourceType.Row>>;
        'library.resource':          Table<typeof Resource.Row, 'created_at' | 'updated_at' | 'trashed_by' | 'trashed_at'>;
        'library.resource_ancestor': ReadOnly<Table<typeof ResourceAncestor.Row>>;
    }

    /** What other services may include: select only. Writes go through ResourceRepository (exported by LibraryModule). */
    export type ReadTables = { [K in keyof Tables]: ReadOnly<Tables[K]> };

    export const database = defineDatabase<Tables & IdentityDB.ReadTables>();
}
