import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Gatekeeper, Library } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { GatekeeperDB } from './gatekeeper.db';
import { GrantRepository } from './grant.repository';
import { RequestMemo } from './request-memo';

const OWNER: Gatekeeper.Role.Rank = 4;

/**
 * Answers "may this principal do this action on this resource?" for every
 * service. Service principals bypass checks. See docs/design/gatekeeper.md.
 */
@Injectable()
export class GatekeeperService {

    constructor(private readonly repository: GrantRepository) {}

    async rank(principal: Principal, rid: Library.Resource.Rid): Promise<Gatekeeper.Role.Rank> {
        return (await this.ranks(principal, [rid])).get(rid) ?? 0;
    }

    async can(principal: Principal, action: Gatekeeper.Action.Name, rid: Library.Resource.Rid): Promise<boolean> {
        return Gatekeeper.Action.isAllowed(await this.rank(principal, rid), action);
    }

    /** NotFound if the principal can't even discover it (don't reveal it exists), Forbidden otherwise. */
    async assert(principal: Principal, action: Gatekeeper.Action.Name, rid: Library.Resource.Rid): Promise<void> {
        const rank = await this.rank(principal, rid);

        if (!Gatekeeper.Action.isAllowed(rank, 'discover'))
            throw new NotFoundException('Not found');

        if (!Gatekeeper.Action.isAllowed(rank, action))
            throw new ForbiddenException(`Requires ${action} access`);
    }

    /** Which of these the principal may act on — one query for any number. */
    async filter<R extends Library.Resource.Rid>(principal: Principal, action: Gatekeeper.Action.Name, rids: R[]): Promise<Set<R>> {
        const ranks = await this.ranks(principal, rids);

        return new Set(rids.filter((rid) => Gatekeeper.Action.isAllowed(ranks.get(rid) ?? 0, action)));
    }

    // ── grants ──────────────────────────────────────────────────────────

    async listGrants(principal: Principal, rid: Library.Resource.Rid): Promise<Gatekeeper.Grant.Schema[]> {
        await this.assert(principal, 'read', rid);

        const rows = await this.repository.list(principal, rid);

        return rows.map(GatekeeperDB.RoleGrant.toDomain);
    }

    async grant(
        principal: Principal,
        rid:       Library.Resource.Rid,
        subject:   Gatekeeper.Grant.Subject,
        role:      Gatekeeper.Role.Name,
    ): Promise<Gatekeeper.Grant.Schema> {
        await this.assert(principal, 'manage', rid);

        const row = await this.repository.put(principal, rid, subject, role);

        return GatekeeperDB.RoleGrant.toDomain(row);
    }

    async revoke(principal: Principal, rid: Library.Resource.Rid, subject: Gatekeeper.Grant.Subject): Promise<void> {
        await this.assert(principal, 'manage', rid);
        await this.repository.revoke(principal, rid, subject);
    }

    // ── internals ───────────────────────────────────────────────────────

    private async ranks(principal: Principal, rids: Library.Resource.Rid[]): Promise<Map<Library.Resource.Rid, Gatekeeper.Role.Rank>> {
        if (principal.type === 'service')
            return new Map(rids.map((rid) => [rid, OWNER]));

        const key = (rid: Library.Resource.Rid) => `${principal.userRid}|${rid}`;
        const result = new Map<Library.Resource.Rid, Gatekeeper.Role.Rank>();
        const missing: Library.Resource.Rid[] = [];

        for (const rid of rids) {
            const memo = RequestMemo.get(key(rid));

            if (memo === undefined)
                missing.push(rid);
            else
                result.set(rid, memo);
        }

        if (missing.length > 0) {
            const fetched = await this.repository.effectiveRanks(Principal.SELF('gatekeeper.check'), principal.userRid, missing);

            for (const rid of missing) {
                const rank = fetched.get(rid) ?? 0;

                result.set(rid, rank);
                RequestMemo.set(key(rid), rank);
            }
        }

        return result;
    }
}
