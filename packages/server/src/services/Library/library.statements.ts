import type { Transaction } from 'kysely';
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

/**
 * Which of these RIDs are live — they exist, aren't trashed, and no ancestor
 * is. One query for any number, in the caller's transaction.
 */
export async function liveResources(trx: Transaction<any>, rids: Library.Resource.Rid[]): Promise<Set<Library.Resource.Rid>> {
    if (rids.length === 0)
        return new Set();

    const library = trx as unknown as Transaction<LibraryDB.Tables>;

    const rows = await library
        .selectFrom('library.resource as r')
        .select('r.rid')
        .where('r.rid', 'in', rids)
        .where(({ not, exists, selectFrom }) => not(exists(
            selectFrom('library.resource_ancestor as a')
                .innerJoin('library.resource as anc', 'anc.rid', 'a.ancestor_rid')
                .select('a.ancestor_rid')
                .whereRef('a.resource_rid', '=', 'r.rid')
                .where('anc.trashed_at', 'is not', null),
        )))
        .execute();

    return new Set(rows.map((row) => row.rid));
}
