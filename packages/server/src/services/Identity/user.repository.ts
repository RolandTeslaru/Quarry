import { Injectable } from '@nestjs/common';
import { Identity } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { IdentityDB } from './identity.db';

/** Row operations on identity.user. */
@Injectable()
export class UserRepository extends Repository(IdentityDB.database) {

    @Transactional()
    async get(principal: Principal, rid: Identity.User.Rid): Promise<IdentityDB.User.Row | null> {
        const row = await this.trx
            .selectFrom('identity.user')
            .selectAll()
            .where('rid', '=', rid)
            .executeTakeFirst();

        return row ?? null;
    }

    @Transactional()
    async list(principal: Principal): Promise<IdentityDB.User.Row[]> {
        return this.trx
            .selectFrom('identity.user')
            .selectAll()
            .orderBy('display_name')
            .execute();
    }

    /**
     * Creates the member as admin only if the workspace has none yet — the
     * bootstrap path for the very first login. Returns null if an admin exists.
     */
    @Transactional('service')
    async insertFirstAdmin(principal: Principal.Service, values: {
        rid:         Identity.User.Rid;
        email:       string;
        displayName: string;
    }): Promise<IdentityDB.User.Row | null> {
        // Serialises concurrent first logins: only one can become the first admin.
        await this.trx.selectFrom('identity.user').select('rid').forUpdate().execute();

        const admin = await this.trx
            .selectFrom('identity.user')
            .select('rid')
            .where('workspace_role', '=', 'admin')
            .executeTakeFirst();

        if (admin)
            return null;

        return this.trx
            .insertInto('identity.user')
            .values({
                rid:            values.rid,
                email:          values.email,
                display_name:   values.displayName,
                workspace_role: 'admin',
            })
            .onConflict((oc) => oc.column('rid').doUpdateSet({ workspace_role: 'admin' }))
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    @Transactional()
    async insert(principal: Principal, values: {
        rid:           Identity.User.Rid;
        email:         string;
        displayName:   string;
        workspaceRole: Identity.User.WorkspaceRole;
    }): Promise<IdentityDB.User.Row> {
        return this.trx
            .insertInto('identity.user')
            .values({
                rid:            values.rid,
                email:          values.email,
                display_name:   values.displayName,
                workspace_role: values.workspaceRole,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
    }
}
