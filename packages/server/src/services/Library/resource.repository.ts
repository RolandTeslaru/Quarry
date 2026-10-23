import { Injectable, NotFoundException } from '@nestjs/common';
import { Library, type Platform } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { requireAffected } from '@/db/errors';
import { Repository, Transactional } from '@/db/repository';
import { AuditRepository } from '@/services/Audit/audit.repository';
import { LibraryDB } from './library.db';
import { insertResource, isLive, liveResources, visibleResources } from './library.statements';

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

    /** Projects and folders. Subtypes are created by their owning service via library.statements. */
    @Transactional()
    async createContainer(principal: Principal, values: {
        rid:         Library.Project.Rid | Library.Folder.Rid;
        type:        'project' | 'folder';
        name:        string;
        description: string | null;
        parentRid:   Library.Resource.Rid | null;
    }): Promise<LibraryDB.Resource.Row> {
        if (values.parentRid && (!(await liveResources(this.trx, [values.parentRid])).has(values.parentRid)
            || !(await visibleResources(this.trx, [values.parentRid])).has(values.parentRid)))
            throw new NotFoundException('Not found');

        return insertResource(this.trx, { ...values, createdBy: Principal.actorOf(principal) });
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
}
