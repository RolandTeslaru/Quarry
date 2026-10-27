import { Injectable } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { ForgeDB } from '../forge.db';
import { BuildRepository, type NewBuild } from './build.repository';
import { JobRepository, type NewJob } from './job.repository';
import { JobSpecRepository } from './job-spec.repository';

/**
 * The `forge` schema. A write that spans builds and jobs is a method here, so
 * it is one transaction — the sub-repositories' calls join it. `build`, `job`
 * and `jobSpec` expose only what is safe on its own: the pieces of those
 * writes (start, finish, end, …) stay private (`_build`, `_job`, `_jobSpec`),
 * so a service can't commit half.
 *
 * Expose a sub-repository method only if it is, by itself, a complete and valid
 * state change (or a read): `markQueued` is; `schedule` isn't — it's only valid
 * once the parents succeeded, which `finishJob` decides.
 */
@Injectable()
export class ForgeRepository extends Repository(ForgeDB.database) {

    public readonly build:   Pick<BuildRepository, 'get' | 'list'>;
    public readonly job:     Pick<JobRepository, 'get' | 'listForBuild' | 'listToRelay' | 'markQueued' | 'heartbeat'>;
    public readonly jobSpec: Pick<JobSpecRepository, 'publish' | 'getCurrent' | 'get'>;

    constructor(
        private readonly _build:   BuildRepository,
        private readonly _job:     JobRepository,
        private readonly _jobSpec: JobSpecRepository,
    ) {
        super();

        this.build = _build;
        this.job = _job;
        this.jobSpec = _jobSpec;
    }

    // ── builds ──────────────────────────────────────────────────────────

    /** The build and its jobs, in one transaction. Returns the jobs as created. */
    @Transactional()
    public async initializeBuild(principal: Principal, build: NewBuild, jobs: NewJob[]): Promise<Forge.Job.Schema[]> {
        await this._build.insert(principal, build);
        await this._job.insertForBuild(principal, build, jobs);

        return this._job.listForBuild(principal, build.rid);
    }

    /**
     * The build and its unfinished jobs, canceled. Null if it had already finished; otherwise the canceled jobs.
     * Jobs before the build, as finishJob and failBuild lock them: the opposite order deadlocks with a finishing last job.
     */
    @Transactional()
    public async cancelBuild(principal: Principal, rid: Forge.Build.Rid): Promise<Forge.Job.Schema[] | null> {
        const finishedAt = new Date();

        const canceled = await this._job.cancelUnfinished(principal, rid, finishedAt);

        if (!await this._build.end(principal, rid, 'canceled', finishedAt)) {
            // A finished build has no unfinished jobs, so nothing was canceled above — unless that broke.
            if (canceled.length > 0)
                throw new Error(`Build ${rid} had finished with unfinished jobs`);

            return null;
        }

        return canceled;
    }

    /** A job failed: its build's unfinished jobs are canceled and the build failed (descendants only, later). Returns the canceled jobs. */
    @Transactional()
    public async failBuild(principal: Principal, buildRid: Forge.Build.Rid): Promise<Forge.Job.Schema[]> {
        const finishedAt = new Date();

        const canceled = await this._job.cancelUnfinished(principal, buildRid, finishedAt);

        await this._build.end(principal, buildRid, 'failed', finishedAt);

        return canceled;
    }

    // ── running jobs (ForgeAgents) ──────────────────────────────────────

    /**
     * A ForgeAgent takes the job and gets its spec — in one transaction, so a
     * job is never left running without its agent knowing what to run. Null if
     * this attempt isn't waiting to start.
     */
    @Transactional()
    public async startJob(principal: Principal, rid: Forge.Job.Rid, attempt: number): Promise<Forge.API.Agent.Start.Response | null> {
        const job = await this._job.start(principal, rid, attempt);

        if (!job)
            return null;

        // The FK guarantees it exists; a failure here undoes the start.
        const jobSpec = await this._jobSpec.get(principal, job.jobSpecRid);

        if (!jobSpec)
            throw new Error(`Job ${rid} has no job spec ${job.jobSpecRid}`);

        return { job, jobSpec };
    }

    /**
     * Records how the running attempt ended, then advances its build: on success,
     * each child whose parents have all succeeded goes `waiting → scheduled`;
     * nothing left unfinished → the build is done. Null if this attempt wasn't
     * running. Returns the jobs it scheduled, for the relay.
     */
    @Transactional()
    public async finishJob(
        principal: Principal,
        rid:       Forge.Job.Rid,
        outcome:   Forge.API.Agent.Finish.Request,
    ): Promise<{ job: Forge.Job.Schema; scheduled: Forge.Job.Schema[] } | null> {
        const job = await this._job.finish(principal, rid, outcome);

        if (!job)
            return null;

        const scheduled = outcome.status === 'succeeded'
            ? await this._scheduleReadyChildren(principal, job)
            : [];

        await this._endBuildIfDone(principal, job.buildRid);

        return { job, scheduled };
    }

    // ── helpers ─────────────────────────────────────────────────────────

    /** The finished job's children whose parents have all succeeded: `waiting → scheduled`. */
    private async _scheduleReadyChildren(principal: Principal, finished: Forge.Job.Schema): Promise<Forge.Job.Schema[]> {
        const build = await this._build.get(principal, finished.buildRid);

        if (!build)
            throw new Error(`Job ${finished.rid} has no build ${finished.buildRid}`);

        const jobs = await this._job.listForBuild(principal, finished.buildRid);

        const succeeded = new Set(jobs.filter((job) => job.status === 'succeeded').map((job) => job.jobSpecRid));
        const ready = Forge.Build.Plan.getReadyChildren(build.plan, finished.jobSpecRid, succeeded);

        return this._job.schedule(principal, finished.buildRid, ready);
    }

    /** No job left unfinished → the build succeeded, or failed if one of them did. */
    private async _endBuildIfDone(principal: Principal, buildRid: Forge.Build.Rid): Promise<void> {
        const jobs = await this._job.listForBuild(principal, buildRid);

        if (jobs.some((job) => Forge.Job.UNFINISHED.includes(job.status)))
            return;

        await this._build.end(principal, buildRid, jobs.some((job) => job.status === 'failed') ? 'failed' : 'succeeded', new Date());
    }
}
