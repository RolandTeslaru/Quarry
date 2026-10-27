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

        await this.trx
            .insertInto('forge.job')
            .values(jobs.map((job) => ({
                rid:          job.rid,
                build_rid:    build.rid,
                job_spec_rid: job.jobSpecRid,
                outputs:      json(job.outputs),
            })))
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

    /** The build and its unfinished jobs, canceled. False if it had already finished. */
    @Transactional()
    public async cancelBuild(principal: Principal, rid: Forge.Build.Rid): Promise<boolean> {
        const finishedAt = new Date();

        const result = await this.trx
            .updateTable('forge.build')
            .set({ status: 'canceled', finished_at: finishedAt })
            .where('rid', '=', rid)
            .where('status', '=', 'running')
            .executeTakeFirst();

        if (Number(result.numUpdatedRows) === 0)
            return false;

        await this.trx
            .updateTable('forge.job')
            .set({ status: 'canceled', finished_at: finishedAt })
            .where('build_rid', '=', rid)
            .where('status', 'in', ['waiting', 'running'])
            .execute();

        return true;
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
            .where('status', 'in', ['waiting', 'running'])
            .execute();

        return jobs.flatMap((job) => Object.entries(job.outputs).map(([datasetRid, rid]) => ({
            rid,
            datasetRid: Catalog.Dataset.Rid.parse(datasetRid),
        })));
    }

    // ── helpers ─────────────────────────────────────────────────────────

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
