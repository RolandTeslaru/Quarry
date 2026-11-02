import { Injectable } from '@nestjs/common';
import type { Foundations, Library } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { isLive } from '@quarry/platform-kernel/db/liveness';
import { Repository, Transactional } from '@quarry/platform-kernel/db/repository';
import { LibraryDB } from './library.db';

/** library.lineage_edge. */
@Injectable()
export class LineageRepository extends Repository(LibraryDB.database) {

    /** Replaces everything the declarer has on the branch. */
    @Transactional()
    public async declare(
        principal:     Principal,
        declaredByRid: Library.Resource.Rid,
        branch:        Foundations.Branch,
        edges:         Pick<Library.Lineage.Edge, 'upstreamRid' | 'downstreamRid'>[],
    ): Promise<LibraryDB.LineageEdge.Row[]> {
        await this.trx
            .deleteFrom('library.lineage_edge')
            .where('declared_by_rid', '=', declaredByRid)
            .where('branch', '=', branch)
            .execute();

        if (edges.length === 0)
            return [];

        return this.trx
            .insertInto('library.lineage_edge')
            .values(edges.map((edge) => ({
                upstream_rid:    edge.upstreamRid,
                downstream_rid:  edge.downstreamRid,
                branch,
                declared_by_rid: declaredByRid,
            })))
            .returningAll()
            .execute();
    }

    @Transactional()
    public async getUpstream(
        principal: Principal,
        rid:       Library.Resource.Rid,
        branch:    Foundations.Branch,
        walk:      Library.Lineage.Walk,
    ): Promise<LibraryDB.LineageGraph.Rows> {
        return this.walk(rid, branch, walk, 'downstream_rid', 'upstream_rid');
    }

    @Transactional()
    public async getDownstream(
        principal: Principal,
        rid:       Library.Resource.Rid,
        branch:    Foundations.Branch,
        walk:      Library.Lineage.Walk,
    ): Promise<LibraryDB.LineageGraph.Rows> {
        return this.walk(rid, branch, walk, 'upstream_rid', 'downstream_rid');
    }

    /** Edges with both ends among these, both live and visible. */
    @Transactional()
    public async getEdgesBetween(
        principal: Principal,
        rids:      Library.Resource.Rid[],
        branch:    Foundations.Branch,
    ): Promise<LibraryDB.LineageEdge.Row[]> {
        if (rids.length === 0)
            return [];

        return this.trx
            .selectFrom('library.lineage_edge as edge')
            .innerJoin('library.resource as upstream', 'upstream.rid', 'edge.upstream_rid')
            .innerJoin('library.resource as downstream', 'downstream.rid', 'edge.downstream_rid')
            .selectAll('edge')
            .where('edge.branch', '=', branch)
            .where('edge.upstream_rid', 'in', rids)
            .where('edge.downstream_rid', 'in', rids)
            .where(isLive('edge.upstream_rid'))
            .where(isLive('edge.downstream_rid'))
            .execute();
    }

    /** These resources, those that are live and visible, and the edges among them. */
    @Transactional()
    public async getGraph(
        principal: Principal,
        rids:      Library.Resource.Rid[],
        branch:    Foundations.Branch,
    ): Promise<LibraryDB.LineageGraph.Rows> {
        if (rids.length === 0)
            return { resources: [], edges: [] };

        const resources = await this.trx
            .selectFrom('library.resource as resource')
            .selectAll('resource')
            .where('resource.rid', 'in', rids)
            .where(isLive('resource.rid'))
            .execute();

        const edges = await this.getEdgesBetween(principal, rids, branch);       // joins this transaction

        return { resources, edges };
    }

    // ── helpers ─────────────────────────────────────────────────────────

    /**
     * Hop by hop from the resource, so a hidden or trashed resource stops the walk there. Joining both
     * ends applies library.resource's policy to each: the edge's own policies let a declarer's editors see more.
     */
    private async walk(
        rid:    Library.Resource.Rid,
        branch: Foundations.Branch,
        walk:   Library.Lineage.Walk,
        from:   'upstream_rid' | 'downstream_rid',
        to:     'upstream_rid' | 'downstream_rid',
    ): Promise<LibraryDB.LineageGraph.Rows> {
        const edges: LibraryDB.LineageEdge.Row[] = [];
        const visited = new Set<Library.Resource.Rid>([rid]);
        let frontier = new Set<Library.Resource.Rid>([rid]);

        for (let hop = 0; hop < walk.depth && frontier.size > 0; hop += 1) {
            const rows = await this.trx
                .selectFrom('library.lineage_edge as edge')
                .innerJoin('library.resource as upstream', 'upstream.rid', 'edge.upstream_rid')
                .innerJoin('library.resource as downstream', 'downstream.rid', 'edge.downstream_rid')
                .selectAll('edge')
                .where('edge.branch', '=', branch)
                .where(`edge.${from}`, 'in', [...frontier])
                .$if(!walk.includeTrashed, (query) => query.where(isLive(`edge.${to}`)))
                .execute();

            frontier = new Set();

            for (const row of rows) {
                edges.push(row);

                if (visited.has(row[to]))
                    continue;

                visited.add(row[to]);
                frontier.add(row[to]);
            }
        }

        const resources = await this.trx
            .selectFrom('library.resource')
            .selectAll()
            .where('rid', 'in', [...visited])
            .execute();

        return { resources, edges };
    }
}
