import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import { Library } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { GatekeeperService } from '@/services/Gatekeeper/gatekeeper.service';
import { SecurityGate } from '@/services/Gatekeeper/security-gate';
import { LibraryDB } from './library.db';
import { ResourceRepository } from './resource.repository';

@Injectable()
export class LibraryService {

    constructor(
        readonly gatekeeper:         GatekeeperService,
        private readonly repository: ResourceRepository,
    ) {}

    /** Projects visible to the principal (discover or better). */
    async listProjects(principal: Principal): Promise<Library.Resource.Base[]> {
        const rows = await this.repository.projects(principal);
        const visible = await this.gatekeeper.filter(principal, 'discover', rows.map((row) => row.rid));

        return rows.filter((row) => visible.has(row.rid)).map(LibraryDB.Resource.toBase);
    }

    /** Projects are roots, so there's no parent to gate on: admins only (gatekeeper.md §10). */
    async createProject(principal: Principal, request: z.output<typeof Library.API.Project.Create.Request>): Promise<Library.Project.Schema> {
        if (principal.type === 'delegate' || (principal.type === 'user' && principal.workspaceRole !== 'admin'))
            throw new ForbiddenException('Only workspace admins can create projects');

        const row = await this.repository.createContainer(principal, {
            rid:         Library.Project.createRid(),
            type:        'project',
            name:        request.name,
            description: request.description,
            parentRid:   null,
        });

        return LibraryDB.Resource.toProject(row);
    }

    @SecurityGate('write')
    async createFolder(principal: Principal, parentRid: Library.Resource.Rid, request: z.output<typeof Library.API.Folder.Create.Request>): Promise<Library.Folder.Schema> {
        const row = await this.repository.createContainer(principal, {
            rid:         Library.Folder.createRid(),
            type:        'folder',
            name:        request.name,
            description: request.description,
            parentRid,
        });

        return LibraryDB.Resource.toFolder(row);
    }

    @SecurityGate('discover')
    async get(principal: Principal, rid: Library.Resource.Rid): Promise<Library.Resource.Base> {
        const row = await this.repository.get(principal, rid);          // live rows only

        if (!row)
            throw new NotFoundException('Not found');

        return LibraryDB.Resource.toBase(row);
    }

    /** Root first. */
    @SecurityGate('discover')
    async path(principal: Principal, rid: Library.Resource.Rid): Promise<Library.Resource.Base[]> {
        const rows = await this.repository.path(principal, rid);

        return rows.map(LibraryDB.Resource.toBase);
    }

    /** A child's rank is max(parent's rank, its own grants) — one batched check covers them all. */
    @SecurityGate('discover')
    async children(principal: Principal, parentRid: Library.Resource.Rid): Promise<Library.Resource.Base[]> {
        const rows = await this.repository.children(principal, parentRid);
        const visible = await this.gatekeeper.filter(principal, 'discover', rows.map((row) => row.rid));

        return rows.filter((row) => visible.has(row.rid)).map(LibraryDB.Resource.toBase);
    }

    @SecurityGate('write')
    async rename(principal: Principal, rid: Library.Resource.Rid, name: string): Promise<void> {
        await this.repository.rename(principal, rid, name);
    }

    /** Needs write on the resource (gate) and on the new parent (explicit). */
    @SecurityGate('write')
    async move(principal: Principal, rid: Library.Resource.Rid, parentRid: Library.Resource.Rid): Promise<void> {
        await this.gatekeeper.assert(principal, 'write', parentRid);
        await this.repository.move(principal, rid, parentRid);
    }

    @SecurityGate('write')
    async trash(principal: Principal, rid: Library.Resource.Rid): Promise<void> {
        await this.repository.trash(principal, rid);
    }
}
