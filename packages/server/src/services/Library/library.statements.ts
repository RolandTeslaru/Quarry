import { sql, type Transaction } from 'kysely';
import { Identity, Library } from '@quarry/shared/domain';
import { LibraryDB } from './library.db';

/**
 * Library's SQL, run inside other code's transactions: by @EnsureResource
 * (a subtype's library row) and by @Transactional (liveness). Owned here;
 * nothing outside Library writes library tables any other way.
 */

/** Inserts a library row in the caller's transaction. */
export async function insertResource(
    trx: Transaction<any>,                       // the caller's transaction, typed against its own schema
    values: {
        rid:         Library.Resource.Rid;
        type:        Library.Resource.Type;
        name:        string;
        description: string | null;
        parentRid:   Library.Resource.Rid | null;
        createdBy:   Identity.User.Rid | null;
    },
): Promise<LibraryDB.Resource.Row> {
    const library = trx as unknown as Transaction<LibraryDB.Tables>;

    return library
        .insertInto('library.resource')
        .values({
            rid:         values.rid,
            type:        values.type,
            name:        values.name,
            description: values.description,
            parent_rid:  values.parentRid,
            created_by:  values.createdBy,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
}

/** Trashes a resource in the caller's transaction — for an owning service undoing a create it couldn't finish. */
export async function trashResource(trx: Transaction<any>, rid: Library.Resource.Rid, trashedBy: Identity.User.Rid | null): Promise<void> {
    const library = trx as unknown as Transaction<LibraryDB.Tables>;

    await library
        .updateTable('library.resource')
        .set({ trashed_at: new Date(), trashed_by: trashedBy })
        .where('rid', '=', rid)
        .where('trashed_at', 'is', null)
        .execute();
}

/**
 * Which of these RIDs are live — they exist, aren't trashed, and no ancestor
 * is. One query for any number, in the caller's transaction. Asks
 * `library.is_live`, which sees the whole tree whatever the user may see (RLS).
 */
export async function liveResources(trx: Transaction<any>, rids: Library.Resource.Rid[]): Promise<Set<Library.Resource.Rid>> {
    if (rids.length === 0)
        return new Set();

    const { rows } = await sql<{ rid: Library.Resource.Rid }>`
        select rid from unnest(${rids}::text[]) as t(rid) where library.is_live(rid)`.execute(trx);

    return new Set(rows.map((row) => row.rid));
}

/**
 * Which of these RIDs the transaction's user can see (RLS-filtered; all of them
 * for the system). A parent that's live but hidden must 404 like a missing one —
 * otherwise the insert's 403 would reveal that it exists.
 */
export async function visibleResources(trx: Transaction<any>, rids: Library.Resource.Rid[]): Promise<Set<Library.Resource.Rid>> {
    if (rids.length === 0)
        return new Set();

    const library = trx as unknown as Transaction<LibraryDB.Tables>;
    const rows = await library.selectFrom('library.resource').select('rid').where('rid', 'in', rids).execute();

    return new Set(rows.map((row) => row.rid));
}

/** `library.is_live(<column>)` — for queries that list resources and must drop dead ones. */
export const isLive = (column: string) => sql<boolean>`library.is_live(${sql.ref(column)})`;
