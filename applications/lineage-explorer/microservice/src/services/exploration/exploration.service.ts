import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { type Library, LineageExplorer, type Platform } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { LibraryService } from '@quarry/platform-kernel/services/Library/library.service';
import { ExplorationRepository } from './exploration.repository';

/**
 * Saved explorations: create, list, open, save. Rows are plain, so row-level security decides who may do
 * what. Lineage is the Library's: an exploration holds its nodes, and opening it reads its graph.
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
            legend:      request.legend,
        });
    }

    async list(principal: Principal): Promise<LineageExplorer.Exploration.Meta[]> {
        return this.repository.list(principal);
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
        const { resources, edges } = await this.library.lineage.getEdgesAndResources(principal, nodeRids, exploration.branch);

        return {
            exploration,
            graph: LineageExplorer.Graph.rehydrate(exploration.nodes, resources, edges),
        };
    }

    async save(
        principal: Principal,
        rid:       LineageExplorer.Exploration.Rid,
        request:   LineageExplorer.API.Exploration.Save.Request,
    ): Promise<LineageExplorer.Exploration> {
        await this.repository.save(principal, rid, request);

        const exploration = await this.repository.get(principal, rid);

        if (!exploration)
            throw new NotFoundException('Not found');

        return exploration;
    }
}
