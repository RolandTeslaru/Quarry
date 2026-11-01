import { Injectable } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { Repository, Transactional } from '@quarry/platform-kernel/db/repository';
import { DurableQueueHandle, InjectDurableQueue } from '@quarry/platform-kernel/infra/durable-queue';
import { CatalogClient } from '@quarry/platform-kernel/microservice/clients';
import { ForgeDB } from '../forge.db';
import { BuildRepository, type NewBuild } from './build.repository';
import { JobRepository, type PlannedJob } from '../../job/job.repository';

/**
 * The `forge` schema's writes that span builds and jobs: each is a method here, so
 * it is one transaction — the sub-repositories' calls join it. `build` exposes only
 * what is safe on its own: the pieces of those writes (start, finish, end, …) stay
 * private (`_build`, `_job`), so a service can't commit half. Jobs on their own are
 * JobService's (its JobRepository), recipes RecipeService's.
 *
 * Jobs reach ForgeAgents through a durable queue (docs/design/durable-queues.md):
 * a job's message is added in the transaction that schedules it, and acked in the
 * one that starts it or ends its build.
 */
@Injectable()
export class ForgeRepository extends Repository(ForgeDB.database) {

    public readonly build: Pick<BuildRepository, 'get' | 'list'>;

    constructor(
        private readonly _build:   BuildRepository,
        private readonly _job:     JobRepository,
        private readonly _catalog: CatalogClient,
        @InjectDurableQueue(Forge.DurableQueue.RunJob)
        private readonly _runJobQueue: DurableQueueHandle<typeof Forge.Queue.RunJob.Definition>,
    ) {
        super();

        this.build = _build;
    }

    // ── builds ──────────────────────────────────────────────────────────

    /** The build and its jobs — and its roots' messages — in one transaction. Returns the jobs as created. */
    @Transactional()
    public async initializeBuild(
        principal:   Principal,
        build:       NewBuild,
        plannedJobs: Record<Forge.Job.Rid, PlannedJob>,
    ): Promise<Record<Forge.Job.Rid, Forge.Job>> {
        await this._build.insert(principal, build);

        const jobs = await this._job.insert(principal, build, plannedJobs);
        const roots: Forge.Job[] = [];

        for (const job of Object.values(jobs))
            if (job.status === 'scheduled')
                roots.push(job);

        await this.enqueueJobs(roots);

        return jobs;
    }

    /**
     * The build and its unfinished jobs, canceled. Null if it had already finished; otherwise the canceled jobs.
     * The build is locked before any job row, as finishJob and cancelForFailure lock it: another order deadlocks.
     */
    @Transactional()
    public async cancelBuild(principal: Principal, rid: Forge.Build.Rid): Promise<Forge.Job[] | null> {
        await this._build.lock(principal, rid);

        const finishedAt = new Date();

        const canceled = await this._job.cancelUnfinished(principal, rid, finishedAt);

        if (!await this._build.end(principal, rid, 'canceled', finishedAt)) {
            // A finished build has no unfinished jobs, so nothing was canceled above — unless that broke.
            if (canceled.length > 0)
                throw new Error(`Build ${rid} had finished with unfinished jobs`);

            return null;
        }

        await this.withdrawJobs(canceled);                         // their messages won't be taken now

        return canceled;
    }

    /**
     * A job failed: as its build's `onJobFailure` says, its descendants' unfinished jobs are canceled,
     * or all the build's are. The build ends — failed — once nothing is left unfinished. Returns the canceled jobs.
     */
    @Transactional()
    public async cancelForFailure(principal: Principal, failed: Forge.Job): Promise<Forge.Job[]> {
        const build = await this._build.lock(principal, failed.buildRid);
        const finishedAt = new Date();
        let canceled: Forge.Job[];

        if (build.onJobFailure === 'cancel-build')
            canceled = await this._job.cancelUnfinished(principal, build.rid, finishedAt);
        else
            canceled = await this._job.cancelUnfinishedOf(principal, build.rid, Forge.Build.Plan.getDescendants(build.plan, failed.recipeRid), finishedAt);

        await this.endBuildIfDone(principal, build.rid);
        await this.withdrawJobs(canceled);

        return canceled;
    }

    // ── running jobs (ForgeAgents) ──────────────────────────────────────

    /** A ForgeAgent claims the job, its inputs pinned, and its message is acked. Null if this attempt isn't waiting to be claimed. */
    @Transactional()
    public async claimJob(
        principal: Principal,
        rid:       Forge.Job.Rid,
        attempt:   number,
        inputs:    NonNullable<Forge.Job['inputs']>,
    ): Promise<Forge.Job | null> {
        const job = await this._job.claim(principal, rid, attempt, inputs);

        if (!job)
            return null;

        await this.withdrawJobs([job]);

        return job;
    }

    /**
     * Records how the running attempt ended, then advances its build: on success,
     * its outputs are committed (Catalog's commitTransactions call, before this transaction commits) and
     * each child whose parents have all succeeded goes `waiting → scheduled`;
     * nothing left unfinished → the build is done. Null if this attempt wasn't
     * running. The scheduled jobs' messages are added; returns them.
     */
    @Transactional()
    public async finishJob(
        principal: Principal,
        rid:       Forge.Job.Rid,
        outcome:   Forge.API.Agent.Finish.Request,
    ): Promise<{ job: Forge.Job; scheduled: Forge.Job[] } | null> {
        // Before any job row: sibling jobs finishing at once each see the other's outcome, and the order matches cancelBuild's.
        const build = await this._build.lockForJob(principal, rid);
        const job = await this._job.finish(principal, rid, outcome);

        if (!job)
            return null;

        let scheduled: Forge.Job[] = [];

        // Its outputs become new versions before any child is scheduled: a child pins its inputs when it's claimed.
        if (outcome.status === 'succeeded') {
            await this._catalog.commitTransactions(principal, { transactions: job.outputs });

            scheduled = await this.scheduleReadyChildren(principal, build, job);
        }

        await this.enqueueJobs(scheduled);
        await this.endBuildIfDone(principal, job.buildRid);

        return { job, scheduled };
    }

    // ── helpers ─────────────────────────────────────────────────────────

    /** Queues scheduled jobs for the ForgeAgents: their run-job messages, into the outbox — in the transaction that scheduled them. */
    private async enqueueJobs(jobs: Forge.Job[]): Promise<void> {
        await this._runJobQueue.add(jobs.map((job) => {
            const message = Forge.Job.getQueueMessage(job);

            return { message, jobId: Forge.Queue.RunJob.getQueueJobId(message) };
        }));
    }

    /** Withdraws jobs from the agents' queue — claimed, or never to be: their messages out of the outbox. Jobs that never had one (waiting) are no-ops. */
    private async withdrawJobs(jobs: Forge.Job[]): Promise<void> {
        await this._runJobQueue.ack(jobs.map((job) => Forge.Queue.RunJob.getQueueJobId(Forge.Job.getQueueMessage(job))));
    }

    /** The finished job's children whose parents have all succeeded: `waiting → scheduled`. */
    private async scheduleReadyChildren(principal: Principal, build: Forge.Build, finished: Forge.Job): Promise<Forge.Job[]> {
        const jobs = await this._job.listByBuild(principal, finished.buildRid);

        const succeeded = new Set<Forge.Recipe.Rid>();

        for (const job of jobs)
            if (job.status === 'succeeded')
                succeeded.add(job.recipeRid);

        const ready = Forge.Build.Plan.getReadyChildren(build.plan, finished.recipeRid, succeeded);

        return this._job.schedule(principal, finished.buildRid, ready);
    }

    /** No job left unfinished → the build succeeded, or failed if one of them did. */
    private async endBuildIfDone(principal: Principal, buildRid: Forge.Build.Rid): Promise<void> {
        const jobs = await this._job.listByBuild(principal, buildRid);

        if (jobs.some((job) => Forge.Job.UNFINISHED.includes(job.status)))
            return;

        await this._build.end(principal, buildRid, jobs.some((job) => job.status === 'failed') ? 'failed' : 'succeeded', new Date());
    }
}
