import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { Gatekeeper, Identity, Library } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { GatekeeperDB } from './gatekeeper.db';

/** Grants, and the one query that answers every permission check. */
@Injectable()
export class GrantRepository extends Repository(GatekeeperDB.database) {

    /** Effective rank of `userRid` on each resource — gatekeeper.effective_ranks, see database.md §5. */
    @Transactional('service')
    async effectiveRanks(
        principal: Principal.Service,
        userRid:    Identity.User.Rid,
        rids:      Library.Resource.Rid[],
    ): Promise<Map<Library.Resource.Rid, Gatekeeper.Role.Rank>> {
        if (rids.length === 0)
            return new Map();

        const { rows } = await sql<{ resource_rid: Library.Resource.Rid; rank: Gatekeeper.Role.Rank }>`
            select resource_rid, rank
              from gatekeeper.effective_ranks(${rids}::foundations.rid[], ${userRid}::identity.user_rid)
        `.execute(this.trx);

        return new Map(rows.map((row) => [row.resource_rid, row.rank]));
    }

    @Transactional()
    async list(principal: Principal, rid: Library.Resource.Rid): Promise<GatekeeperDB.RoleGrant.Row[]> {
        return this.trx
            .selectFrom('gatekeeper.role_grant')
            .selectAll()
            .where('resource_rid', '=', rid)
            .orderBy('granted_at')
            .execute();
    }

    /**
     * Sets the subject's role on the resource — one upsert on (resource, subject),
     * so concurrent puts don't collide and the row keeps its identity.
     */
    @Transactional()
    async put(principal: Principal, rid: Library.Resource.Rid, subject: Gatekeeper.Grant.Subject, role: Gatekeeper.Role.Name): Promise<GatekeeperDB.RoleGrant.Row> {
        const grantedBy = Principal.actorOf(principal);

        return this.trx
            .insertInto('gatekeeper.role_grant')
            .values({
                resource_rid: rid,
                user_rid:     subject.type === 'user'  ? subject.userRid  : null,
                group_rid:    subject.type === 'group' ? subject.groupRid : null,
                role,
                granted_by:   grantedBy,
            })
            .onConflict((oc) => (subject.type === 'user'
                ? oc.columns(['resource_rid', 'user_rid']).where('user_rid', 'is not', null)       // matches role_grant_user
                : oc.columns(['resource_rid', 'group_rid']).where('group_rid', 'is not', null))    // matches role_grant_group
                .doUpdateSet({ role, granted_by: grantedBy, granted_at: new Date() }))
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    @Transactional()
    async revoke(principal: Principal, rid: Library.Resource.Rid, subject: Gatekeeper.Grant.Subject): Promise<void> {
        await this._delete(rid, subject);
    }

    private async _delete(rid: Library.Resource.Rid, subject: Gatekeeper.Grant.Subject): Promise<void> {
        await this.trx
            .deleteFrom('gatekeeper.role_grant')
            .where('resource_rid', '=', rid)
            .$call((query) => subject.type === 'user'
                ? query.where('user_rid', '=', subject.userRid)
                : query.where('group_rid', '=', subject.groupRid))
            .execute();
    }
}
