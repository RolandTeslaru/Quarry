import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { Catalog, Forge } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { json } from '@/db/table';
import { ForgeDB } from '../forge.db';

/** A build as created — the database fills in its status, who and when. */
export type NewBuild = Omit<Forge.Build.Schema, 'status' | 'createdBy' | 'createdAt' | 'finishedAt'>;

/** forge.build. Writes that also touch its jobs belong on ForgeRepository. */
@Injectable()
export class BuildRepository extends Repository(ForgeDB.database) {

    @Transactional()
    public async insert(principal: Principal, build: NewBuild): Promise<void> {
        await this.trx
            .insertInto('forge.build')
            .values({
                rid:               build.rid,
                branch:            build.branch,
                fallback_branches: build.fallbackBranches,
                target:            json(build.target),
                plan:              json(build.plan),
                force_build:       build.forceBuild,
                abort_on_failure:  build.abortOnFailure,
                retry_count:       build.retryCount,
                created_by:        Principal.actorOf(principal),
            })
            .execute();
    }

    @Transactional()
    public async get(principal: Principal, rid: Forge.Build.Rid): Promise<Forge.Build.Schema | null> {
        const row = await this.trx
            .selectFrom('forge.build')
            .selectAll()
            .where('rid', '=', rid)
            .executeTakeFirst();

        return row ? ForgeDB.Build.toDomain(row) : null;
    }

    /** Newest first; with a dataset, only builds targeting it. */
    @Transactional()
    public async list(principal: Principal, filter: { datasetRid?: Catalog.Dataset.Rid; limit: number }): Promise<Forge.Build.Schema[]> {
        let query = this.trx
            .selectFrom('forge.build')
            .selectAll()
            .orderBy('created_at', 'desc')
            .limit(filter.limit);

        if (filter.datasetRid)
            query = query.where(sql<boolean>`target -> 'datasetRids' ? ${filter.datasetRid}`);

        const rows = await query.execute();

        return rows.map(ForgeDB.Build.toDomain);
    }

    /** Holds the build's row until the transaction ends, so its jobs finishing at once take turns. */
    @Transactional()
    public async lock(principal: Principal, rid: Forge.Build.Rid): Promise<void> {
        await this.trx
            .selectFrom('forge.build')
            .select('rid')
            .where('rid', '=', rid)
            .forUpdate()
            .execute();
    }

    /** `lock`, for the build of this job. */
    @Transactional()
    public async lockForJob(principal: Principal, jobRid: Forge.Job.Rid): Promise<void> {
        await this.trx
            .selectFrom('forge.build')
            .select('rid')
            .where('rid', '=', this.trx.selectFrom('forge.job').select('build_rid').where('rid', '=', jobRid))
            .forUpdate()
            .execute();
    }

    /** A running build ends with `status`. False if it had already ended. */
    @Transactional()
    public async end(
        principal:  Principal,
        rid:        Forge.Build.Rid,
        status:     Exclude<Forge.Build.Status, 'running'>,
        finishedAt: Date,
    ): Promise<boolean> {
        const result = await this.trx
            .updateTable('forge.build')
            .set({ status, finished_at: finishedAt })
            .where('rid', '=', rid)
            .where('status', '=', 'running')
            .executeTakeFirst();

        return Number(result.numUpdatedRows) > 0;
    }
}
