import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { Catalog, Forge, Foundations, Library } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { json } from '@/db/table';
import { ForgeDB } from './forge.db';

/** A spec as a producer publishes it — Forge fills in the RID, branch, producer and who. */
export interface PublishedJobSpec {
    readonly logic:             Forge.JobSpec.Logic;
    readonly inputDatasetRids:  Catalog.Dataset.Rid[];
    readonly outputDatasetRids: Catalog.Dataset.Rid[];
    readonly resources:         Forge.JobSpec.Resources;
}

/** A build as created — the database fills in its status, who and when. */
export type NewBuild = Omit<Forge.Build.Schema, 'status' | 'createdBy' | 'createdAt' | 'finishedAt'>;

/** A job as created — one per node of the plan — with its outputs' transactions already open. */
export type NewJob = Pick<Forge.Job.Schema, 'rid' | 'jobSpecRid' | 'outputs'>;

/** The `forge` schema: job specs and the pointers to the current ones, builds, jobs. */
@Injectable()
export class ForgeRepository extends Repository(ForgeDB.database) {

    // ── job specs ───────────────────────────────────────────────────────

    /**
     * Replaces everything the producer publishes on the branch: inserts the new
     * specs, drops the producer's old pointers, points each output at its new
     * spec. An output another producer owns is a conflict.
     */
    @Transactional()
    public async publishJobSpecs(
        principal:   Principal,
        producerRid: Library.Resource.Rid,
        branch:      Foundations.Branch,
        specs:       PublishedJobSpec[],
    ): Promise<Forge.JobSpec.Schema[]> {
        const outputs = specs.flatMap((spec) => spec.outputDatasetRids);

        if (new Set(outputs).size !== outputs.length)
            throw new BadRequestException('Two job specs write the same dataset');

        await this._requireUnowned(producerRid, branch, outputs);

        await this.trx
            .deleteFrom('forge.current_job_spec')
            .where('branch', '=', branch)
            .where('job_spec_rid', 'in', (eb) => eb
                .selectFrom('forge.job_spec')
                .select('rid')
                .where('producer_rid', '=', producerRid)
                .where('branch', '=', branch))
            .execute();

        const published: Forge.JobSpec.Schema[] = [];

        for (const spec of specs)
            published.push(await this._insertJobSpec(principal, producerRid, branch, spec));

        return published;
    }

    /** The spec computing the dataset on the first of `branches` that has one; null if none does. */
    @Transactional()
    public async getCurrentJobSpec(
        principal:  Principal,
        datasetRid: Catalog.Dataset.Rid,
        branches:   Foundations.Branch[],
    ): Promise<Forge.JobSpec.Schema | null> {
        const pointers = await this.trx
            .selectFrom('forge.current_job_spec')
            .selectAll()
            .where('dataset_rid', '=', datasetRid)
            .where('branch', 'in', branches)
            .execute();

        const pointer = branches
            .map((branch) => pointers.find((candidate) => candidate.branch === branch))
            .find((candidate) => candidate !== undefined);

        if (!pointer)
            return null;

        return this.getJobSpec(principal, pointer.job_spec_rid);
    }

    @Transactional()
    public async getJobSpec(principal: Principal, rid: Forge.JobSpec.Rid): Promise<Forge.JobSpec.Schema | null> {
        const row = await this.trx
            .selectFrom('forge.job_spec')
            .selectAll()
            .where('rid', '=', rid)
            .executeTakeFirst();

        if (!row)
            return null;

        const inputs = await this.trx
            .selectFrom('forge.job_spec_input_dataset')
            .select('dataset_rid')
            .where('job_spec_rid', '=', rid)
            .execute();

        const outputs = await this.trx
            .selectFrom('forge.job_spec_output_dataset')
            .select('dataset_rid')
            .where('job_spec_rid', '=', rid)
            .execute();

        return ForgeDB.JobSpec.toDomain(
            row,
            inputs.map((input) => input.dataset_rid),
            outputs.map((output) => output.dataset_rid),
        );
    }

    // ── builds ──────────────────────────────────────────────────────────

    /** The build and its jobs, in one transaction. */
    @Transactional()
    public async initializeBuild(principal: Principal, build: NewBuild, jobs: NewJob[]): Promise<Forge.API.GetBuild.Response> {
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

        const scheduledAt = new Date();

        // Roots may run at once; the rest wait for their parents.
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

        const created = await this.getBuild(principal, build.rid);

        if (!created)
            throw new Error(`Build ${build.rid} isn't visible to its creator`);

        return created;
    }

    /** The build and its jobs, by RID. */
    @Transactional()
    public async getBuild(principal: Principal, rid: Forge.Build.Rid): Promise<Forge.API.GetBuild.Response | null> {
        const row = await this.trx
            .selectFrom('forge.build')
            .selectAll()
            .where('rid', '=', rid)
            .executeTakeFirst();

        if (!row)
            return null;

        const jobs = await this.trx
            .selectFrom('forge.job')
            .selectAll()
            .where('build_rid', '=', rid)
            .execute();

        return {
            build: ForgeDB.Build.toDomain(row),
            jobs:  Object.fromEntries(jobs.map((job) => [job.rid, ForgeDB.Job.toDomain(job)])),
        };
    }

    /** Newest first; with a dataset, only builds targeting it. */
    @Transactional()
    public async listBuilds(principal: Principal, filter: { datasetRid?: Catalog.Dataset.Rid; limit: number }): Promise<Forge.Build.Schema[]> {
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

    /** The build and its unfinished jobs, canceled. Null if it had already finished; otherwise the canceled jobs. */
    @Transactional()
    public async cancelBuild(principal: Principal, rid: Forge.Build.Rid): Promise<Forge.Job.Schema[] | null> {
        const finishedAt = new Date();

        const result = await this.trx
            .updateTable('forge.build')
            .set({ status: 'canceled', finished_at: finishedAt })
            .where('rid', '=', rid)
            .where('status', '=', 'running')
            .executeTakeFirst();

        if (Number(result.numUpdatedRows) === 0)
            return null;

        const canceled = await this.trx
            .updateTable('forge.job')
            .set({ status: 'canceled', finished_at: finishedAt })
            .where('build_rid', '=', rid)
            .where('status', 'in', [...Forge.Job.UNFINISHED])
            .returningAll()
            .execute();

        return canceled.map(ForgeDB.Job.toDomain);
    }

    // ── jobs ────────────────────────────────────────────────────────────

    @Transactional()
    public async getJob(principal: Principal, rid: Forge.Job.Rid): Promise<Forge.Job.Schema | null> {
        const row = await this.trx
            .selectFrom('forge.job')
            .selectAll()
            .where('rid', '=', rid)
            .executeTakeFirst();

        return row ? ForgeDB.Job.toDomain(row) : null;
    }

    /** The output transactions of the build's unfinished jobs — what canceling aborts. */
    @Transactional()
    public async listUnfinishedOutputs(principal: Principal, buildRid: Forge.Build.Rid): Promise<Pick<Catalog.Transaction.Schema, 'rid' | 'datasetRid'>[]> {
        const jobs = await this.trx
            .selectFrom('forge.job')
            .select('outputs')
            .where('build_rid', '=', buildRid)
            .where('status', 'in', [...Forge.Job.UNFINISHED])
            .execute();

        return jobs.flatMap((job) => Object.entries(job.outputs).map(([datasetRid, rid]) => ({
            rid,
            datasetRid: Catalog.Dataset.Rid.parse(datasetRid),
        })));
    }

    // ── running jobs (the relay, ForgeAgents) ───────────────────────────

    /** Scheduled → queued, after the relay pushed it. Null if the job was already past `scheduled`. */
    @Transactional()
    public async markQueued(principal: Principal, job: Forge.Queue.RunJob.Job): Promise<Forge.Job.Schema | null> {
        const row = await this.trx
            .updateTable('forge.job')
            .set({ status: 'queued', queued_at: new Date() })
            .where('rid', '=', job.jobRid)
            .where('attempt', '=', job.attempt)
            .where('status', '=', 'scheduled')
            .returningAll()
            .executeTakeFirst();

        return row ? ForgeDB.Job.toDomain(row) : null;
    }

    /**
     * A ForgeAgent takes the job: `scheduled` or `queued` → `running`, once per
     * attempt (`scheduled` too: the relay may have pushed and crashed before marking
     * it queued), and gets its spec — in one transaction, so a job is never left
     * running without its agent knowing what to run. Null if this attempt isn't
     * waiting to start.
     */
    @Transactional()
    public async startJob(principal: Principal, rid: Forge.Job.Rid, attempt: number): Promise<Forge.API.Agent.Start.Response | null> {
        const now = new Date();

        const row = await this.trx
            .updateTable('forge.job')
            .set({ status: 'running', started_at: now, heartbeat_at: now })
            .where('rid', '=', rid)
            .where('attempt', '=', attempt)
            .where('status', 'in', ['scheduled', 'queued'])
            .returningAll()
            .executeTakeFirst();

        if (!row)
            return null;

        // The FK guarantees it exists; getJobSpec joins this transaction, so a failure here undoes the start.
        const jobSpec = await this.getJobSpec(principal, row.job_spec_rid);

        if (!jobSpec)
            throw new Error(`Job ${rid} has no job spec ${row.job_spec_rid}`);

        return { job: ForgeDB.Job.toDomain(row), jobSpec };
    }

    /** The attempt is still running: renew its lease. Null if it isn't running (any more). */
    @Transactional()
    public async heartbeatJob(principal: Principal, rid: Forge.Job.Rid, attempt: number): Promise<Forge.Job.Schema | null> {
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
        const row = await this.trx
            .updateTable('forge.job')
            .set({ status: outcome.status, failure: outcome.failure ? json(outcome.failure) : null, finished_at: new Date() })
            .where('rid', '=', rid)
            .where('attempt', '=', outcome.attempt)
            .where('status', '=', 'running')
            .returningAll()
            .executeTakeFirst();

        if (!row)
            return null;

        const scheduled = outcome.status === 'succeeded'
            ? await this._scheduleReadyChildren(row)
            : [];

        await this._finishBuildIfDone(row.build_rid);

        return { job: ForgeDB.Job.toDomain(row), scheduled };
    }

    /** A job failed: its build's unfinished jobs are canceled and the build failed (descendants only, later). Returns the canceled jobs. */
    @Transactional()
    public async failBuild(principal: Principal, buildRid: Forge.Build.Rid): Promise<Forge.Job.Schema[]> {
        const finishedAt = new Date();

        const canceled = await this.trx
            .updateTable('forge.job')
            .set({ status: 'canceled', finished_at: finishedAt })
            .where('build_rid', '=', buildRid)
            .where('status', 'in', [...Forge.Job.UNFINISHED])
            .returningAll()
            .execute();

        await this.trx
            .updateTable('forge.build')
            .set({ status: 'failed', finished_at: finishedAt })
            .where('rid', '=', buildRid)
            .where('status', '=', 'running')
            .execute();

        return canceled.map(ForgeDB.Job.toDomain);
    }

    // ── helpers ─────────────────────────────────────────────────────────

    /** The finished job's children whose parents have all succeeded: `waiting → scheduled` (once, whoever finishes last). */
    private async _scheduleReadyChildren(finished: ForgeDB.Job.Row): Promise<Forge.Job.Schema[]> {
        const build = await this.trx
            .selectFrom('forge.build')
            .select('plan')
            .where('rid', '=', finished.build_rid)
            .executeTakeFirstOrThrow();

        const jobs = await this.trx
            .selectFrom('forge.job')
            .select(['job_spec_rid', 'status'])
            .where('build_rid', '=', finished.build_rid)
            .execute();

        const succeeded = new Set(jobs.filter((job) => job.status === 'succeeded').map((job) => job.job_spec_rid));
        const ready = Forge.Build.Plan.getReadyChildren(build.plan, finished.job_spec_rid, succeeded);

        if (ready.length === 0)
            return [];

        const rows = await this.trx
            .updateTable('forge.job')
            .set({ status: 'scheduled', scheduled_at: new Date() })
            .where('build_rid', '=', finished.build_rid)
            .where('job_spec_rid', 'in', ready)
            .where('status', '=', 'waiting')
            .returningAll()
            .execute();

        return rows.map(ForgeDB.Job.toDomain);
    }

    /** No job left unfinished → the build succeeded, or failed if one of them did. */
    private async _finishBuildIfDone(buildRid: Forge.Build.Rid): Promise<void> {
        const jobs = await this.trx
            .selectFrom('forge.job')
            .select('status')
            .where('build_rid', '=', buildRid)
            .execute();

        if (jobs.some((job) => Forge.Job.UNFINISHED.includes(job.status)))
            return;

        await this.trx
            .updateTable('forge.build')
            .set({
                status:      jobs.some((job) => job.status === 'failed') ? 'failed' : 'succeeded',
                finished_at: new Date(),
            })
            .where('rid', '=', buildRid)
            .where('status', '=', 'running')
            .execute();
    }

    /** The spec, its datasets, and a pointer from each output. */
    private async _insertJobSpec(
        principal:   Principal,
        producerRid: Library.Resource.Rid,
        branch:      Foundations.Branch,
        spec:        PublishedJobSpec,
    ): Promise<Forge.JobSpec.Schema> {
        const rid = Forge.JobSpec.createRid();

        const row = await this.trx
            .insertInto('forge.job_spec')
            .values({
                rid,
                producer_rid: producerRid,
                branch,
                logic:        json(spec.logic),
                resources:    json(spec.resources),
                published_by: Principal.actorOf(principal),
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        if (spec.inputDatasetRids.length > 0)
            await this.trx
                .insertInto('forge.job_spec_input_dataset')
                .values(spec.inputDatasetRids.map((datasetRid) => ({ job_spec_rid: rid, dataset_rid: datasetRid })))
                .execute();

        await this.trx
            .insertInto('forge.job_spec_output_dataset')
            .values(spec.outputDatasetRids.map((datasetRid) => ({ job_spec_rid: rid, dataset_rid: datasetRid })))
            .execute();

        await this.trx
            .insertInto('forge.current_job_spec')
            .values(spec.outputDatasetRids.map((datasetRid) => ({ dataset_rid: datasetRid, branch, job_spec_rid: rid })))
            .execute();

        return ForgeDB.JobSpec.toDomain(row, spec.inputDatasetRids, spec.outputDatasetRids);
    }

    /**
     * One producer per dataset per branch. The pointer's primary key enforces it;
     * this names the producer when the caller can see it.
     */
    private async _requireUnowned(producerRid: Library.Resource.Rid, branch: Foundations.Branch, outputs: Catalog.Dataset.Rid[]): Promise<void> {
        if (outputs.length === 0)
            return;

        const owned = await this.trx
            .selectFrom('forge.current_job_spec as pointer')
            .innerJoin('forge.job_spec as spec', 'spec.rid', 'pointer.job_spec_rid')
            .select(['pointer.dataset_rid', 'spec.producer_rid'])
            .where('pointer.branch', '=', branch)
            .where('pointer.dataset_rid', 'in', outputs)
            .where('spec.producer_rid', '!=', producerRid)
            .executeTakeFirst();

        if (owned)
            throw new ConflictException(`${owned.dataset_rid} is already produced by ${owned.producer_rid} on ${branch}`);
    }
}
