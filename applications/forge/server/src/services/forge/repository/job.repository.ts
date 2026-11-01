import { Injectable } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { Repository, Transactional } from '@quarry/platform-kernel/db/repository';
import { json } from '@quarry/platform-kernel/db/table';
import { ForgeDB } from '../forge.db';

/** A job of the build's plan, one per node, before it's a row: its RID minted, its outputs' transactions already open. */
export type PlannedJob = Pick<Forge.Job, 'rid' | 'recipeRid' | 'outputs'>;

/**
 * forge.job. Writes that also touch the build, or a job's message (the durable
 * queue's outbox), belong on ForgeRepository.
 */
@Injectable()
export class JobRepository extends Repository(ForgeDB.database) {

    /** The build's planned jobs, inserted: roots `scheduled` (may run at once), the rest `waiting` for their parents. Returns them as created. */
    @Transactional()
    public async insert(
        principal:   Principal,
        build:       Pick<Forge.Build, 'rid' | 'plan'>,
        plannedJobs: Record<Forge.Job.Rid, PlannedJob>,
    ): Promise<Record<Forge.Job.Rid, Forge.Job>> {
        const scheduledAt = new Date();
        const roots = new Set(build.plan.roots);

        const rows = await this.trx
            .insertInto('forge.job')
            .values(Object.values(plannedJobs).map((plannedJob) => {
                const isRoot = roots.has(plannedJob.recipeRid);

                return {
                    rid:          plannedJob.rid,
                    build_rid:    build.rid,
                    recipe_rid:   plannedJob.recipeRid,
                    outputs:      json(plannedJob.outputs),
                    status:       isRoot ? 'scheduled' as const : 'waiting' as const,
                    scheduled_at: isRoot ? scheduledAt : null,
                };
            }))
            .returningAll()
            .execute();

        const jobs: Record<Forge.Job.Rid, Forge.Job> = {};

        for (const row of rows)
            jobs[row.rid] = ForgeDB.Job.toDomain(row);

        return jobs;
    }

    @Transactional()
    public async get(principal: Principal, rid: Forge.Job.Rid): Promise<Forge.Job | null> {
        const row = await this.trx
            .selectFrom('forge.job')
            .selectAll()
            .where('rid', '=', rid)
            .executeTakeFirst();

        return row ? ForgeDB.Job.toDomain(row) : null;
    }

    @Transactional()
    public async listByBuild(principal: Principal, buildRid: Forge.Build.Rid): Promise<Forge.Job[]> {
        const rows = await this.trx
            .selectFrom('forge.job')
            .selectAll()
            .where('build_rid', '=', buildRid)
            .execute();

        return rows.map(ForgeDB.Job.toDomain);
    }

    /** The build's `waiting` jobs for these recipes → `scheduled` (once, whoever gets there first). */
    @Transactional()
    public async schedule(principal: Principal, buildRid: Forge.Build.Rid, recipeRids: Forge.Recipe.Rid[]): Promise<Forge.Job[]> {
        if (recipeRids.length === 0)
            return [];

        const rows = await this.trx
            .updateTable('forge.job')
            .set({ status: 'scheduled', scheduled_at: new Date() })
            .where('build_rid', '=', buildRid)
            .where('recipe_rid', 'in', recipeRids)
            .where('status', '=', 'waiting')
            .returningAll()
            .execute();

        return rows.map(ForgeDB.Job.toDomain);
    }

    /** The claim: `scheduled` → `running`, once per attempt, with its inputs pinned. Null if this attempt isn't waiting to be claimed. */
    @Transactional()
    public async claim(
        principal: Principal,
        rid:       Forge.Job.Rid,
        attempt:   number,
        inputs:    NonNullable<Forge.Job['inputs']>,
    ): Promise<Forge.Job | null> {
        const now = new Date();

        const row = await this.trx
            .updateTable('forge.job')
            .set({
                status:       'running',
                started_at:   now,
                heartbeat_at: now,
                inputs:       json(inputs),
            })
            .where('rid', '=', rid)
            .where('attempt', '=', attempt)
            .where('status', '=', 'scheduled')
            .returningAll()
            .executeTakeFirst();

        return row ? ForgeDB.Job.toDomain(row) : null;
    }

    /** The attempt is still running: renew its lease. Null if it isn't running (any more). */
    @Transactional()
    public async heartbeat(principal: Principal, rid: Forge.Job.Rid, attempt: number): Promise<Forge.Job | null> {
        const row = await this.trx
            .updateTable('forge.job')
            .set({ heartbeat_at: new Date() })
            .where('rid', '=', rid)
            .where('attempt', '=', attempt)
            .where('status', '=', 'running')
            .returningAll()
            .executeTakeFirst();

        return row ? ForgeDB.Job.toDomain(row) : null;
    }

    /** Records how the running attempt ended. Null if this attempt wasn't running. */
    @Transactional()
    public async finish(principal: Principal, rid: Forge.Job.Rid, outcome: Forge.API.Agent.Finish.Request): Promise<Forge.Job | null> {
        const row = await this.trx
            .updateTable('forge.job')
            .set({ status: outcome.status, failure: outcome.failure ? json(outcome.failure) : null, finished_at: new Date() })
            .where('rid', '=', rid)
            .where('attempt', '=', outcome.attempt)
            .where('status', '=', 'running')
            .returningAll()
            .executeTakeFirst();

        return row ? ForgeDB.Job.toDomain(row) : null;
    }

    /** These recipes' unfinished jobs in the build → `canceled`. Returns them. */
    @Transactional()
    public async cancelUnfinishedOf(
        principal:  Principal,
        buildRid:   Forge.Build.Rid,
        recipeRids: Set<Forge.Recipe.Rid>,
        finishedAt: Date,
    ): Promise<Forge.Job[]> {
        // `in ()` isn't SQL: a leaf's failure has no descendants to cancel.
        if (recipeRids.size === 0)
            return [];

        const rows = await this.trx
            .updateTable('forge.job')
            .set({ status: 'canceled', finished_at: finishedAt })
            .where('build_rid', '=', buildRid)
            .where('recipe_rid', 'in', [...recipeRids])
            .where('status', 'in', [...Forge.Job.UNFINISHED])
            .returningAll()
            .execute();

        return rows.map(ForgeDB.Job.toDomain);
    }

    /** The build's unfinished jobs → `canceled`. Returns them. */
    @Transactional()
    public async cancelUnfinished(principal: Principal, buildRid: Forge.Build.Rid, finishedAt: Date): Promise<Forge.Job[]> {
        const rows = await this.trx
            .updateTable('forge.job')
            .set({ status: 'canceled', finished_at: finishedAt })
            .where('build_rid', '=', buildRid)
            .where('status', 'in', [...Forge.Job.UNFINISHED])
            .returningAll()
            .execute();

        return rows.map(ForgeDB.Job.toDomain);
    }
}
