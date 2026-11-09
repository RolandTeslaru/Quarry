import { Injectable } from '@nestjs/common';
import { Foundations, Library } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { LibraryDB } from './library.db';
import { LineageRepository } from './lineage.repository';

/**
 * How resources feed each other (docs/design/lineage.md). Reached as `library.lineage`.
 * Row-level security decides what shows. A read goes one hop unless a walk says otherwise.
 */
@Injectable()
export class LineageService {

    constructor(private readonly repository: LineageRepository) {}

    /** Replaces everything the declarer has on the branch. Call it inside the transaction that publishes what the edges describe. */
    public async declare(
        principal:     Principal,
        declaredByRid: Library.Resource.Rid,
        branch:        Foundations.Branch,
        edges:         Pick<Library.Lineage.Edge, 'upstreamRid' | 'downstreamRid'>[],
    ): Promise<Library.Lineage.Edge[]> {
        const rows = await this.repository.declare(principal, declaredByRid, branch, edges);

        return rows.map(LibraryDB.LineageEdge.toDomain);
    }

    /** What feeds the resource. */
    public async getUpstream(
        principal: Principal,
        rid:       Library.Resource.Rid,
        branch:    Foundations.Branch,
        walk:      Library.Lineage.Walk = Library.Lineage.Walk.ONE_HOP,
    ) {
        return LibraryDB.LineageGraph.toDomain(await this.repository.getUpstream(principal, rid, branch, walk));
    }

    /** What the resource feeds. */
    public async getDownstream(
        principal: Principal,
        rid:       Library.Resource.Rid,
        branch:    Foundations.Branch,
        walk:      Library.Lineage.Walk = Library.Lineage.Walk.ONE_HOP,
    ) {
        return LibraryDB.LineageGraph.toDomain(await this.repository.getDownstream(principal, rid, branch, walk));
    }

    /** The edges among these resources: an end that's trashed or hidden leaves its edges out. */
    public async getEdgesBetween(principal: Principal, rids: Library.Resource.Rid[], branch: Foundations.Branch): Promise<Library.Lineage.Edge[]> {
        const rows = await this.repository.getEdgesBetween(principal, rids, branch);

        return rows.map(LibraryDB.LineageEdge.toDomain);
    }

    /** These resources, those that are live and visible, and the edges among them. */
    public async getEdgesAndResources(principal: Principal, rids: Library.Resource.Rid[], branch: Foundations.Branch) {
        const rows = await this.repository.getEdgesAndResources(principal, rids, branch);

        const resources: Record<Library.Resource.Rid, Library.Resource.Base> = {};

        for (const row of rows.resources)
            resources[row.rid] = LibraryDB.Resource.toBase(row);

        const edges: Library.Lineage.Edge[] = [];

        for (const row of rows.edges)
            edges.push(LibraryDB.LineageEdge.toDomain(row));

        return { resources, edges };
    }

    /** Main first, as every dataset has it, then every other branch with lineage the caller can see. */
    public async getBranches(principal: Principal): Promise<Foundations.Branch[]> {
        const branches: Foundations.Branch[] = [Foundations.MAIN_BRANCH];

        for (const branch of await this.repository.getBranches(principal))
            if (branch !== Foundations.MAIN_BRANCH)
                branches.push(branch);

        return branches;
    }
}
