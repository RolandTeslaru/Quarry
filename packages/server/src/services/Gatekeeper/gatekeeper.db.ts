import { z } from 'zod';
import { Gatekeeper, Identity, Library } from '@quarry/shared/domain';
import { defineDatabase } from '@/db/pool';
import type { Table } from '@/db/table';
import type { IdentityDB } from '@/services/Identity/identity.db';
import type { LibraryDB } from '@/services/Library/library.db';

/** The `gatekeeper` schema: role grants. Nobody else reads it — everyone calls Gatekeeper. */
export namespace GatekeeperDB {

    export namespace RoleGrant {
        export const Row = z.object({
            id:          z.uuid(),                  // surrogate key; internal, never exposed
            resource_rid: Library.Resource.Rid,
            user_rid:    Identity.User.Rid.nullable(),
            group_rid:   Identity.Group.Rid.nullable(),
            role:        Gatekeeper.Role.Name,
            granted_by:  Identity.User.Rid.nullable(),
            granted_at:  z.date(),
        });
        export type Row = z.infer<typeof Row>;

        export const toDomain = (row: Row) => Gatekeeper.Grant.Schema.parse({
            resourceRid: row.resource_rid,
            subject:     row.user_rid
                ? { type: 'user',  userRid:  row.user_rid }
                : { type: 'group', groupRid: row.group_rid },
            role:        row.role,
            grantedBy:   row.granted_by,
            grantedAt:   row.granted_at,
        });
    }

    export interface Tables {
        'gatekeeper.role_grant': Table<typeof RoleGrant.Row, 'id' | 'granted_at'>;
    }

    export const database = defineDatabase<Tables & LibraryDB.ReadTables & IdentityDB.ReadTables>();
}
