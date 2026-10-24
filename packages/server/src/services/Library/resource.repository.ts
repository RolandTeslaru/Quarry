import { Injectable, NotFoundException } from '@nestjs/common';
import { Library, type Platform } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { requireAffected } from '@/db/errors';
import { Repository, Transactional } from '@/db/repository';
import { AuditRepository } from '@/services/Audit/audit.repository';
import { LibraryDB } from './library.db';
import { isLive, liveResources } from '@/db/liveness';

/** Row operations on library.resource. Trashed resources — and anything under them — read as absent. */
@Injectable()
export class ResourceRepository extends Repository(LibraryDB.database) {

    constructor(private readonly audit: AuditRepository) {
        super();
    }

    /** The resource, unless it or an ancestor is trashed. */
    @Transactional()
    async get(principal: Principal, rid: Library.Resource.Rid): Promise<LibraryDB.Resource.Row | null> {
        const row = await this.trx
            .selectFrom('library.resource as r')
            .selectAll('r')
            .where('r.rid', '=', rid)
            .where(isLive('r.rid'))
            .executeTakeFirst();

        return row ?? null;
    }

    /** An app opening the resource's page: it, and the audit `open`, in one transaction. Null: not there, or not theirs to see. */
    @Transactional('user')
    async open(principal: Principal.User, rid: Library.Resource.Rid, application: Platform.Application.Id): Promise<LibraryDB.Resource.Row | null> {
        const row = await this.get(principal, rid);                 // joins this transaction

        if (row)
            await this.audit.recordOpen(principal, { rid, type: row.type, application });  // joins this transaction

        return row;
    }

    @Transactional()
    async projects(principal: Principal): Promise<LibraryDB.Resource.Row[]> {
        return this.trx
            .selectFrom('library.resource')
            .selectAll()
            .where('parent_rid', 'is', null)
            .where('trashed_at', 'is', null)
            .orderBy('name')
            .execute();
    }

    /**
     * Live children the explorer lists — types with show_in_explorer (credentials
     * are Keychain's). @Transactional checks the parent itself is live.
     */
    @Transactional()
    async children(principal: Principal, parentRid: Library.Resource.Rid): Promise<LibraryDB.Resource.Row[]> {
        return this.trx
            .selectFrom('library.resource as r')
            .innerJoin('library.resource_type as t', 't.type', 'r.type')
            .selectAll('r')
            .where('r.parent_rid', '=', parentRid)
            .where('r.trashed_at', 'is', null)
            .where('t.show_in_explorer', '=', true)
            .orderBy('r.type')
            .orderBy('r.name')
            .execute();
    }

    /**
     * The live resource at a path of names, root first: a project, then a child
     * of it by name, and so on. Names are unique among live siblings; each step
     * is the user's to see (RLS). Null: no such path, or part of it hidden.
     */
    @Transactional()
    async getByPath(principal: Principal, names: string[]): Promise<LibraryDB.Resource.Row | null> {
        let current: LibraryDB.Resource.Row | null = null;

        for (const name of names) {
            let query = this.trx
                .selectFrom('library.resource')
                .selectAll()
                .where('name', '=', name)
                .where('trashed_at', 'is', null);

            query = current
                ? query.where('parent_rid', '=', current.rid)
                : query.where('parent_rid', 'is', null);

            current = (await query.executeTakeFirst()) ?? null;

            if (!current)
                return null;
        }

        return current;
    }

    /** Root first, the resource itself last. */
    @Transactional()
    async path(principal: Principal, rid: Library.Resource.Rid): Promise<LibraryDB.Resource.Row[]> {
        return this.trx
            .selectFrom('library.resource_ancestor as a')
            .innerJoin('library.resource as r', 'r.rid', 'a.ancestor_rid')
            .selectAll('r')
            .where('a.resource_rid', '=', rid)
            .orderBy('a.depth', 'desc')
            .execute();
    }

    /**
     * A resource's library row — the only way one is created. Projects and
     * folders come here from LibraryService; every other type from its owning
     * service's create, through @EnsureResource, joining that transaction so the
     * library row and the subtype's own commit together.
     *
     * The parent must be live and visible to the user — a hidden one 404s like a
     * missing one, or the insert's 403 would reveal it exists. Whether they may
     * write into it is RLS's call on the insert.
     */
    @Transactional()
    async insert(principal: Principal, values: {
        rid:         Library.Resource.Rid;
        type:        Library.Resource.Type;
        name:        string;
        description: string | null;
        parentRid:   Library.Resource.Rid | null;
    }): Promise<LibraryDB.Resource.Row> {
        if (values.parentRid && !(await this._isLiveAndVisible(values.parentRid)))
            throw new NotFoundException('Not found');

        return this.trx
            .insertInto('library.resource')
            .values({
                rid:         values.rid,
                type:        values.type,
                name:        values.name,
                description: values.description,
                parent_rid:  values.parentRid,
                created_by:  Principal.actorOf(principal),
            })
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    @Transactional()
    async rename(principal: Principal, rid: Library.Resource.Rid, name: string): Promise<void> {
        requireAffected(await this.trx
            .updateTable('library.resource')
            .set({ name, updated_at: new Date() })
            .where('rid', '=', rid)
            .executeTakeFirstOrThrow());
    }

    /**
     * Triggers re-link the closure table and reject non-container parents and
     * cycles; RLS needs write on the resource and on the new parent.
     */
    @Transactional()
    async move(principal: Principal, rid: Library.Resource.Rid, parentRid: Library.Resource.Rid): Promise<void> {
        requireAffected(await this.trx
            .updateTable('library.resource')
            .set({ parent_rid: parentRid, updated_at: new Date() })
            .where('rid', '=', rid)
            .executeTakeFirstOrThrow());
    }

    @Transactional()
    async trash(principal: Principal, rid: Library.Resource.Rid): Promise<void> {
        requireAffected(await this.trx
            .updateTable('library.resource')
            .set({ trashed_at: new Date(), trashed_by: Principal.actorOf(principal) })
            .where('rid', '=', rid)
            .where('trashed_at', 'is', null)
            .executeTakeFirstOrThrow());
    }

    /** Live (the whole tree) and visible to the transaction's user (RLS; everything for the system). */
    private async _isLiveAndVisible(rid: Library.Resource.Rid): Promise<boolean> {
        if (!(await liveResources(this.trx, [rid])).has(rid))
            return false;

        const visible = await this.trx.selectFrom('library.resource').select('rid').where('rid', '=', rid).executeTakeFirst();

        return visible !== undefined;
    }
}
