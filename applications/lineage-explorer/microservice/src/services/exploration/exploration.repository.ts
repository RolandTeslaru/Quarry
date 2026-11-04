import { Injectable } from '@nestjs/common';
import { type Foundations, type Library, LineageExplorer, type Platform } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { requireAffected } from '@quarry/platform-kernel/db/errors';
import { isLive } from '@quarry/platform-kernel/db/liveness';
import { Repository, Transactional } from '@quarry/platform-kernel/db/repository';
import { json } from '@quarry/platform-kernel/db/table';
import { AuditRepository } from '@quarry/platform-kernel/services/Audit/audit.repository';
import { EnsureResource } from '@quarry/platform-kernel/services/Library/ensure-resource';
import { ResourceRepository } from '@quarry/platform-kernel/services/Library/resource.repository';
import { LineageExplorerDB } from './lineage-explorer.db';

/** lineage_explorer.exploration (and its library row). */
@Injectable()
export class ExplorationRepository extends Repository(LineageExplorerDB.database) {

    constructor(
        readonly resources:     ResourceRepository,          // @EnsureResource's
        private readonly audit: AuditRepository,
    ) {
        super();
    }

    /** Library row (via @EnsureResource) + exploration row, in one transaction. */
    @Transactional()
    @EnsureResource('lineage-exploration')
    async create(principal: Principal, values: {
        rid:         LineageExplorer.Exploration.Rid;
        name:        string;
        description: string | null;
        parentRid:   Library.Resource.Rid;
        branch:      Foundations.Branch;
        nodes:       LineageExplorer.Exploration['nodes'];
        legend:      LineageExplorer.Legend;
    }): Promise<LineageExplorer.Exploration> {
        const exploration = await this.trx
            .insertInto('lineage_explorer.exploration')
            .values({
                rid:    values.rid,
                branch: values.branch,
                nodes:  json(values.nodes),
                legend: json(values.legend),
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        return LineageExplorerDB.Exploration.toDomain(exploration, this.resource);
    }

    /** Live explorations only. */
    @Transactional()
    async get(principal: Principal, rid: LineageExplorer.Exploration.Rid): Promise<LineageExplorer.Exploration | null> {
        const row = await this.trx
            .selectFrom('lineage_explorer.exploration as e')
            .innerJoin('library.resource as r', 'r.rid', 'e.rid')
            .selectAll('r')
            .select(['e.branch', 'e.nodes', 'e.legend'])
            .where('e.rid', '=', rid)
            .where('r.trashed_at', 'is', null)
            .executeTakeFirst();

        if (!row)
            return null;

        const { branch, nodes, legend, ...resource } = row;

        return LineageExplorerDB.Exploration.toDomain({ rid, type: 'lineage-exploration', branch, nodes, legend }, resource);
    }

    /** An app opening the exploration: it, and the audit `open`, in one transaction. Null: not there, or not theirs to see. */
    @Transactional('user')
    async open(principal: Principal.User, rid: LineageExplorer.Exploration.Rid, application: Platform.Application.Id): Promise<LineageExplorer.Exploration | null> {
        const exploration = await this.get(principal, rid);     // joins this transaction

        if (exploration)
            await this.audit.recordOpen(principal, { rid, type: 'lineage-exploration', application });     // joins this transaction

        return exploration;
    }

    /** Every live exploration the user can read (RLS), without its nodes. */
    @Transactional()
    async list(principal: Principal): Promise<LineageExplorer.Exploration.Meta[]> {
        const rows = await this.trx
            .selectFrom('lineage_explorer.exploration as e')
            .innerJoin('library.resource as r', 'r.rid', 'e.rid')
            .selectAll('r')
            .select('e.branch')
            .where(isLive('r.rid'))
            .orderBy('r.name')
            .execute();

        return rows.map(({ branch, ...resource }) => LineageExplorerDB.Exploration.toMeta({ branch }, resource));
    }

    @Transactional()
    async save(principal: Principal, rid: LineageExplorer.Exploration.Rid, request: LineageExplorer.API.Exploration.Save.Request): Promise<void> {
        requireAffected(await this.trx
            .updateTable('lineage_explorer.exploration')
            .set({
                nodes:  json(request.nodes),
                legend: json(request.legend),
            })
            .where('rid', '=', rid)
            .executeTakeFirst());
    }
}
