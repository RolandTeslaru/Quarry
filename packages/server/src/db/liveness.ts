import { NotFoundException } from '@nestjs/common';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { Library } from '@quarry/shared/domain';
import { db } from './pool';

// Whether library resources are live — they exist, aren't trashed, and no
// ancestor is. Asks `library.is_live`, which sees the whole tree whatever the
// user may see (RLS). Infrastructure, not a repository: @Transactional checks
// liveness before every method, so it can't go through one.

/** Which of these RIDs are live. One query for any number, in the caller's transaction. */
export async function liveResources(trx: Transaction<any> | Kysely<any>, rids: Library.Resource.Rid[]): Promise<Set<Library.Resource.Rid>> {
    if (rids.length === 0)
        return new Set();

    const { rows } = await sql<{ rid: Library.Resource.Rid }>`
        select rid from unnest(${rids}::text[]) as t(rid) where library.is_live(rid)`.execute(trx);

    return new Set(rows.map((row) => row.rid));
}

/** `library.is_live(<column>)` — for queries that list resources and must drop dead ones. */
export const isLive = (column: string) => sql<boolean>`library.is_live(${sql.ref(column)})`;

const REQUIRE_LIVE = Symbol.for('quarry.service.requireLive');

/**
 * Marks a service method's resource-RID parameter as having to be live — the service-side
 * counterpart of the repository's default (@Transactional checks every top-level RID; @AllowTrashed
 * opts one out). For methods whose effect isn't a repository call with that RID — a worker, Git,
 * a token — so nothing else would notice it's trashed. A parameter decorator can only mark: the
 * method's @SecurityGate enforces it (404), and a test fails a @RequireLive on an ungated method.
 */
export function RequireLive(): ParameterDecorator {
    return (target, key, index) => {
        const holder = target as Record<symbol, Map<string | symbol | undefined, Set<number>> | undefined>;
        const byMethod = (holder[REQUIRE_LIVE] ??= new Map());
        const indexes = byMethod.get(key) ?? new Set<number>();

        indexes.add(index);
        byMethod.set(key, indexes);
    };
}

/** The method's @RequireLive parameter indexes. */
export function getRequiredLive(target: object, key: string | symbol): Set<number> {
    return (target as Record<symbol, Map<string | symbol, Set<number>> | undefined>)[REQUIRE_LIVE]?.get(key) ?? new Set();
}

/** Every method of the class that has a @RequireLive parameter — for the test that each is gated. */
export function getMethodsRequiringLive(target: object): (string | symbol)[] {
    return [...((target as Record<symbol, Map<string | symbol, Set<number>> | undefined>)[REQUIRE_LIVE]?.keys() ?? [])];
}

/** 404 unless every RID is live: exists, isn't trashed, and no ancestor is. */
export async function assertLive(rids: Library.Resource.Rid[]): Promise<void> {
    if (rids.length === 0)
        return;

    const live = await liveResources(db(), rids);

    if (rids.some((rid) => !live.has(rid)))
        throw new NotFoundException('Not found');
}
