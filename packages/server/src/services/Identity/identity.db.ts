import { z } from 'zod';
import { Identity } from '@quarry/shared/domain';
import { defineDatabase } from '@/db/pool';
import type { ReadOnly, Table } from '@/db/table';

/** The `identity` schema: workspace members and groups. A foundation schema — every service may read it. */
export namespace IdentityDB {

    export namespace User {
        export const Row = z.object({
            rid:            Identity.User.Rid,
            email:          z.string(),
            display_name:   z.string(),
            workspace_role: Identity.User.WorkspaceRole,
            created_at:     z.date(),
            deactivated_at: z.date().nullable(),
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row) => Identity.User.Schema.parse({
            rid:           row.rid,
            email:         row.email,
            displayName:   row.display_name,
            workspaceRole: row.workspace_role,
            createdAt:     row.created_at,
            deactivatedAt: row.deactivated_at,
        });
    }

    export namespace Group {
        export const Row = z.object({
            rid:         Identity.Group.Rid,
            name:        z.string(),
            description: z.string().nullable(),
            created_at:  z.date(),
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row) => Identity.Group.Schema.parse({
            rid:         row.rid,
            name:        row.name,
            description: row.description,
            createdAt:   row.created_at,
        });
    }

    // Membership index — rows, no domain entity of its own.
    export namespace GroupMember {
        export const Row = z.object({
            group_rid: Identity.Group.Rid,
            user_rid: Identity.User.Rid,
            added_at: z.date(),
        });
        export type Row = z.infer<typeof Row>;
    }

    export interface Tables {
        'identity.user':         Table<typeof User.Row, 'created_at' | 'workspace_role' | 'deactivated_at'>;
        'identity.group':        Table<typeof Group.Row, 'created_at'>;
        'identity.group_member': Table<typeof GroupMember.Row, 'added_at'>;
    }

    /** What other services may include: select only. */
    export type ReadTables = { [K in keyof Tables]: ReadOnly<Tables[K]> };

    export const database = defineDatabase<Tables>();
}
