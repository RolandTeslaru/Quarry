import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { type Library, LineageExplorer, type Platform } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { LibraryService } from '@quarry/platform-kernel/services/Library/library.service';
import { ExplorationRepository } from './exploration.repository';

/**
 * Saved explorations: create, open, save. Rows are plain, so row-level security decides who may do
 * what. Lineage is the Library's: an exploration holds its nodes, and its edges are read when it's opened.
 */
@Injectable()
export class ExplorationService {

    constructor(
        private readonly library:    LibraryService,
        private readonly repository: ExplorationRepository,
    ) {}

    async create(principal: Principal, request: LineageExplorer.API.Exploration.Create.Request): Promise<LineageExplorer.Exploration> {
        return this.repository.create(principal, {
            rid:         LineageExplorer.Exploration.createRid(),
            name:        request.name,
            description: request.description,
            parentRid:   request.parentRid,
            branch:      request.branch,
            nodes:       request.nodes,
        });
    }

    /** An app opening the exploration — the open recorded with the read (audit). Only users open pages. */
    async open(
        principal:   Principal,
        rid:         LineageExplorer.Exploration.Rid,
        application: Platform.Application.Id,
    ): Promise<LineageExplorer.API.Exploration.Open.Response> {
        if (principal.type !== 'user')
            throw new ForbiddenException('Only users open pages');

        const exploration = await this.repository.open(principal, rid, application);

        if (!exploration)
            throw new NotFoundException('Not found');

        const nodeRids = Object.keys(exploration.nodes) as Library.Resource.Rid[];
        const graph = await this.library.lineage.getGraph(principal, nodeRids, exploration.branch);

        return { exploration, graph };
    }

    async save(
        principal: Principal,
        rid:       LineageExplorer.Exploration.Rid,
        nodes:     LineageExplorer.Exploration['nodes'],
    ): Promise<LineageExplorer.Exploration> {
        await this.repository.save(principal, rid, nodes);

        const exploration = await this.repository.get(principal, rid);

        if (!exploration)
            throw new NotFoundException('Not found');

        return exploration;
    }
}
