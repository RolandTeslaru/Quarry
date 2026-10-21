import { Injectable, NotFoundException } from '@nestjs/common';
import { Library } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { LibraryDB } from './library.db';
import { ResourceRepository } from './resource.repository';

/**
 * Library is plain rows, so row-level security decides who may do what: a
 * resource you can't discover isn't there (404), a write you may not make is
 * refused (403). See database.md §8 for the policies.
 */
@Injectable()
export class LibraryService {

    constructor(private readonly repository: ResourceRepository) {}

    /** Projects the principal can discover (RLS). */
    async listProjects(principal: Principal): Promise<Library.Resource.Base[]> {
        const rows = await this.repository.projects(principal);

        return rows.map(LibraryDB.Resource.toBase);
    }

    /** Projects are roots: RLS lets only workspace admins insert one (gatekeeper.md §10). */
    async createProject(principal: Principal, request: Library.API.Project.Create.Request): Promise<Library.Project.Schema> {
        const row = await this.repository.createContainer(principal, {
            rid:         Library.Project.createRid(),
            type:        'project',
            name:        request.name,
            description: request.description,
            parentRid:   null,
        });

        return LibraryDB.Resource.toProject(row);
    }

    async createFolder(principal: Principal, parentRid: Library.Resource.Rid, request: Library.API.Folder.Create.Request): Promise<Library.Folder.Schema> {
        const row = await this.repository.createContainer(principal, {
            rid:         Library.Folder.createRid(),
            type:        'folder',
            name:        request.name,
            description: request.description,
            parentRid,
        });

        return LibraryDB.Resource.toFolder(row);
    }

    async get(principal: Principal, rid: Library.Resource.Rid): Promise<Library.Resource.Base> {
        const row = await this.repository.get(principal, rid);          // live rows only

        if (!row)
            throw new NotFoundException('Not found');

        return LibraryDB.Resource.toBase(row);
    }

    /** Root first — ancestors the principal can't discover are left out (RLS). */
    async path(principal: Principal, rid: Library.Resource.Rid): Promise<Library.Resource.Base[]> {
        const rows = await this.repository.path(principal, rid);

        if (rows.at(-1)?.rid !== rid)                                   // the resource itself is hidden
            throw new NotFoundException('Not found');

        return rows.map(LibraryDB.Resource.toBase);
    }

    /** The children the principal can discover (RLS); 404 if the parent itself is hidden. */
    async children(principal: Principal, parentRid: Library.Resource.Rid): Promise<Library.Resource.Base[]> {
        await this.get(principal, parentRid);

        const rows = await this.repository.children(principal, parentRid);

        return rows.map(LibraryDB.Resource.toBase);
    }

    async rename(principal: Principal, rid: Library.Resource.Rid, name: string): Promise<void> {
        await this.repository.rename(principal, rid, name);
    }

    /** RLS needs write on the resource and on the new parent. */
    async move(principal: Principal, rid: Library.Resource.Rid, parentRid: Library.Resource.Rid): Promise<void> {
        await this.repository.move(principal, rid, parentRid);
    }

    async trash(principal: Principal, rid: Library.Resource.Rid): Promise<void> {
        await this.repository.trash(principal, rid);
    }
}
