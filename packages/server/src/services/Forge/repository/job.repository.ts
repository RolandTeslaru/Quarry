import { Injectable } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { json } from '@/db/table';
import { ForgeDB } from '../forge.db';

/** A job as created — one per node of the plan — with its outputs' transactions already open. */
export type NewJob = Pick<Forge.Job.Schema, 'rid' | 'jobSpecRid' | 'outputs'>;

/**
 * forge.job. Writes that also touch the build, or a job's message (the durable
 * queue's outbox), belong on ForgeRepository.
 */
@Injectable()
export class JobRepository extends Repository(ForgeDB.database) {

    /** The build's jobs: roots `scheduled` (may run at once), the rest `waiting` for their parents. */
    @Transactional()
    public async insertForBuild(principal: Principal, build: Pick<Forge.Build.Schema, 'rid' | 'plan'>, jobs: NewJob[]): Promise<void> {
        const scheduledAt = new Date();

        await this.trx
            .insertInto('forge.job')
            .values(jobs.map((job) => {
                const isRoot = build.plan.roots.includes(job.jobSpecRid);

                return {
                    rid:          job.rid,
                    build_rid:    build.rid,
                    job_spec_rid: job.jobSpecRid,
                    outputs:      json(job.outputs),
                    status:       isRoot ? 'scheduled' as const : 'waiting' as const,
                    scheduled_at: isRoot ? scheduledAt : null,
                };
            }))
            .execute();
    }

    @Transactional()
    public async get(principal: Principal, rid: Forge.Job.Rid): Promise<Forge.Job.Schema | null> {
        const row = await this.trx
            .selectFrom('forge.job')
            .selectAll()
            .where('rid', '=', rid)
            .executeTakeFirst();

        return row ? ForgeDB.Job.toDomain(row) : null;
    }

    @Transactional()
    public async listForBuild(principal: Principal, buildRid: Forge.Build.Rid): Promise<Forge.Job.Schema[]> {
        const rows = await this.trx
            .selectFrom('forge.job')
            .selectAll()
            .where('build_rid', '=', buildRid)
            .execute();

        return rows.map(ForgeDB.Job.toDomain);
    }

    /** The build's `waiting` jobs for these specs → `scheduled` (once, whoever gets there first). */
    @Transactional()
    public async schedule(principal: Principal, buildRid: Forge.Build.Rid, jobSpecRids: Forge.JobSpec.Rid[]): Promise<Forge.Job.Schema[]> {
        if (jobSpecRids.length === 0)
            return [];

        const rows = await this.trx
            .updateTable('forge.job')
            .set({ status: 'scheduled', scheduled_at: new Date() })
            .where('build_rid', '=', buildRid)
            .where('job_spec_rid', 'in', jobSpecRids)
            .where('status', '=', 'waiting')
            .returningAll()
            .execute();

        return rows.map(ForgeDB.Job.toDomain);
    }

    /** `scheduled` → `running`, once per attempt. Null if this attempt isn't waiting to start. */
    @Transactional()
    public async start(principal: Principal, rid: Forge.Job.Rid, attempt: number): Promise<Forge.Job.Schema | null> {
        const now = new Date();

        const row = await this.trx
            .updateTable('forge.job')
            .set({ status: 'running', started_at: now, heartbeat_at: now })
            .where('rid', '=', rid)
            .where('attempt', '=', attempt)
            .where('status', '=', 'scheduled')
            .returningAll()
            .executeTakeFirst();

        return row ? ForgeDB.Job.toDomain(row) : null;
    }

    /** The attempt is still running: renew its lease. Null if it isn't running (any more). */
    @Transactional()
    public async heartbeat(principal: Principal, rid: Forge.Job.Rid, attempt: number): Promise<Forge.Job.Schema | null> {
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
    public async finish(principal: Principal, rid: Forge.Job.Rid, outcome: Forge.API.Agent.Finish.Request): Promise<Forge.Job.Schema | null> {
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

    /** The build's unfinished jobs → `canceled`. Returns them. */
    @Transactional()
    public async cancelUnfinished(principal: Principal, buildRid: Forge.Build.Rid, finishedAt: Date): Promise<Forge.Job.Schema[]> {
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
