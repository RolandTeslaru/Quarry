import { z } from 'zod';
import { Foundations, Identity, Library } from '@quarry/shared/domain';
import { defineDatabase } from '@quarry/platform-kernel/db/pool';
import type { ReadOnly, Table } from '@quarry/platform-kernel/db/table';
import type { IdentityDB } from '@quarry/platform-kernel/services/Identity/identity.db';

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

    export namespace LineageEdge {
        export const Row = z.object({
            upstream_rid:    Library.Resource.Rid,
            downstream_rid:  Library.Resource.Rid,
            branch:          Foundations.Branch,
            declared_by_rid: Library.Resource.Rid,
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row) => Library.Lineage.Edge.Schema.parse({
            upstreamRid:   row.upstream_rid,
            downstreamRid: row.downstream_rid,
            branch:        row.branch,
            declaredByRid: row.declared_by_rid,
        });
    }

    /** What a lineage read gives its service. */
    export namespace LineageGraph {
        export interface Rows {
            readonly resources: Resource.Row[];
            readonly edges:     LineageEdge.Row[];
        }

        export const toDomain = (rows: Rows): Library.Lineage.Graph => {
            const resources: Library.Lineage.Graph['resources'] = {};

            for (const row of rows.resources)
                resources[row.rid] = Resource.toBase(row);

            return { resources, edges: rows.edges.map(LineageEdge.toDomain) };
        };
    }

    export interface Tables {
        'library.resource_type':     ReadOnly<Table<typeof ResourceType.Row>>;
        'library.resource':          Table<typeof Resource.Row, 'created_at' | 'updated_at' | 'trashed_by' | 'trashed_at'>;
        'library.resource_ancestor': ReadOnly<Table<typeof ResourceAncestor.Row>>;
        'library.lineage_edge':      Table<typeof LineageEdge.Row>;
    }

    /** What other services may include: select only. Writes go through ResourceRepository (exported by LibraryModule) and `library.lineage`. */
    export type ReadTables = { [K in keyof Tables]: ReadOnly<Tables[K]> };

    export const database = defineDatabase<Tables & IdentityDB.ReadTables>();
}
