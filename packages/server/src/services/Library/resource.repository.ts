import { Injectable, NotFoundException } from '@nestjs/common';
import { Library } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { LibraryDB } from './library.db';
import { insertResource, liveResources } from './library.statements';

/** Row operations on library.resource. Trashed resources — and anything under them — read as absent. */
@Injectable()
export class ResourceRepository extends Repository(LibraryDB.database) {

    /** The resource, unless it or an ancestor is trashed. */
    @Transactional()
    async get(principal: Principal, rid: Library.Resource.Rid): Promise<LibraryDB.Resource.Row | null> {
        const row = await this.trx
            .selectFrom('library.resource as r')
            .selectAll('r')
            .where('r.rid', '=', rid)
            .where(({ not, exists, selectFrom }) => not(exists(
                selectFrom('library.resource_ancestor as a')
                    .innerJoin('library.resource as anc', 'anc.rid', 'a.ancestor_rid')
                    .select('a.ancestor_rid')
                    .whereRef('a.resource_rid', '=', 'r.rid')
                    .where('anc.trashed_at', 'is not', null),
            )))
            .executeTakeFirst();

        return row ?? null;
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

    /** Live children. @Transactional checks the parent itself is live. */
    @Transactional()
    async children(principal: Principal, parentRid: Library.Resource.Rid): Promise<LibraryDB.Resource.Row[]> {
        return this.trx
            .selectFrom('library.resource')
            .selectAll()
            .where('parent_rid', '=', parentRid)
            .where('trashed_at', 'is', null)
            .orderBy('type')
            .orderBy('name')
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
        if (values.parentRid && !(await liveResources(this.trx, [values.parentRid])).has(values.parentRid))
            throw new NotFoundException('Not found');

        return insertResource(this.trx, { ...values, createdBy: Principal.actorOf(principal) });
    }

    @Transactional()
    async rename(principal: Principal, rid: Library.Resource.Rid, name: string): Promise<void> {
        await this.trx
            .updateTable('library.resource')
            .set({ name, updated_at: new Date() })
            .where('rid', '=', rid)
            .executeTakeFirstOrThrow();
    }

    /** Triggers re-link the closure table and reject non-container parents and cycles. */
    @Transactional()
    async move(principal: Principal, rid: Library.Resource.Rid, parentRid: Library.Resource.Rid): Promise<void> {
        await this.trx
            .updateTable('library.resource')
            .set({ parent_rid: parentRid, updated_at: new Date() })
            .where('rid', '=', rid)
            .executeTakeFirstOrThrow();
    }

    @Transactional()
    async trash(principal: Principal, rid: Library.Resource.Rid): Promise<void> {
        await this.trx
            .updateTable('library.resource')
            .set({ trashed_at: new Date(), trashed_by: Principal.actorOf(principal) })
            .where('rid', '=', rid)
            .where('trashed_at', 'is', null)
            .executeTakeFirstOrThrow();
    }
}
