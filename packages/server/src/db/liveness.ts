import { sql, type Transaction } from 'kysely';
import type { Library } from '@quarry/shared/domain';

// Whether library resources are live — they exist, aren't trashed, and no
// ancestor is. Asks `library.is_live`, which sees the whole tree whatever the
// user may see (RLS). Infrastructure, not a repository: @Transactional checks
// liveness before every method, so it can't go through one.

/** Which of these RIDs are live. One query for any number, in the caller's transaction. */
export async function liveResources(trx: Transaction<any>, rids: Library.Resource.Rid[]): Promise<Set<Library.Resource.Rid>> {
    if (rids.length === 0)
        return new Set();

    const { rows } = await sql<{ rid: Library.Resource.Rid }>`
        select rid from unnest(${rids}::text[]) as t(rid) where library.is_live(rid)`.execute(trx);

    return new Set(rows.map((row) => row.rid));
}

/** `library.is_live(<column>)` — for queries that list resources and must drop dead ones. */
export const isLive = (column: string) => sql<boolean>`library.is_live(${sql.ref(column)})`;
