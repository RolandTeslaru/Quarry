import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { Dataset, Forge } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { Repository, Transactional } from '@quarry/platform-kernel/db/repository';
import { json } from '@quarry/platform-kernel/db/table';
import { ForgeDB } from '../forge.db';

/** A build as created — the database fills in its status, who and when. */
export type NewBuild = Omit<Forge.Build, 'status' | 'createdBy' | 'createdAt' | 'finishedAt'>;

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
                on_job_failure:    build.onJobFailure,
                retry_count:       build.retryCount,
                created_by:        Principal.actorOf(principal),
            })
            .execute();
    }

    @Transactional()
    public async get(principal: Principal, rid: Forge.Build.Rid): Promise<Forge.Build | null> {
        const row = await this.trx
            .selectFrom('forge.build')
            .selectAll()
            .where('rid', '=', rid)
            .executeTakeFirst();

        return row ? ForgeDB.Build.toDomain(row) : null;
    }

    /** Newest first; with a dataset, only builds targeting it. */
    @Transactional()
    public async list(principal: Principal, filter: { datasetRid?: Dataset.Rid; limit: number }): Promise<Forge.Build[]> {
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

    /** Holds the build's row until the transaction ends, so its jobs finishing at once take turns. Returns the build, as locked. */
    @Transactional()
    public async lock(principal: Principal, rid: Forge.Build.Rid): Promise<Forge.Build> {
        const row = await this.trx
            .selectFrom('forge.build')
            .selectAll()
            .where('rid', '=', rid)
            .forUpdate()
            .executeTakeFirstOrThrow();

        return ForgeDB.Build.toDomain(row);
    }

    /** `lock`, for the build of this job. */
    @Transactional()
    public async lockForJob(principal: Principal, jobRid: Forge.Job.Rid): Promise<Forge.Build> {
        const row = await this.trx
            .selectFrom('forge.build')
            .selectAll()
            .where('rid', '=', this.trx.selectFrom('forge.job').select('build_rid').where('rid', '=', jobRid))
            .forUpdate()
            .executeTakeFirstOrThrow();

        return ForgeDB.Build.toDomain(row);
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
