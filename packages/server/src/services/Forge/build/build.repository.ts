import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { Catalog, Forge, Foundations } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { json } from '@/db/table';
import { ForgeDB } from '../forge.db';

/** A new build as resolved: its options, and each job with the output transactions already opened. */
export interface ResolvedBuild {
    readonly rid:              Forge.Build.Rid;
    readonly branch:           Foundations.Branch;
    readonly fallbackBranches: Foundations.Branch[];
    readonly target:           Forge.Build.Target;
    readonly forceBuild:       boolean;
    readonly abortOnFailure:   boolean;
    readonly retryCount:       number;
    readonly jobs:             ResolvedJob[];
}

export interface ResolvedJob {
    readonly rid:        Forge.Job.Rid;
    readonly jobSpecRid: Forge.JobSpec.Rid;
    readonly outputs:    OpenedOutput[];
}

export interface OpenedOutput {
    readonly datasetRid:     Catalog.Dataset.Rid;
    readonly transactionRid: Catalog.Transaction.Rid;
}

/** A build with its jobs, by RID. */
export interface BuildWithJobs {
    readonly build: Forge.Build.Schema;
    readonly jobs:  Record<Forge.Job.Rid, Forge.Job.Schema>;
}

/** Builds and their jobs. */
@Injectable()
export class BuildRepository extends Repository(ForgeDB.database) {

    /** The build, its jobs and their output transactions, in one transaction. */
    @Transactional()
    public async create(principal: Principal, build: ResolvedBuild): Promise<BuildWithJobs> {
        await this.trx
            .insertInto('forge.build')
            .values({
                rid:               build.rid,
                branch:            build.branch,
                fallback_branches: build.fallbackBranches,
                target:            json(build.target),
                force_build:       build.forceBuild,
                abort_on_failure:  build.abortOnFailure,
                retry_count:       build.retryCount,
                created_by:        Principal.actorOf(principal),
            })
            .execute();

        await this.trx
            .insertInto('forge.job')
            .values(build.jobs.map((job) => ({
                rid:          job.rid,
                build_rid:    build.rid,
                job_spec_rid: job.jobSpecRid,
            })))
            .execute();

        await this.trx
            .insertInto('forge.job_output_transaction')
            .values(build.jobs.flatMap((job) => job.outputs.map((output) => ({
                job_rid:         job.rid,
                transaction_rid: output.transactionRid,
                dataset_rid:     output.datasetRid,
            }))))
            .execute();

        const created = await this.get(principal, build.rid);

        if (!created)
            throw new Error(`Build ${build.rid} isn't visible to its creator`);

        return created;
    }

    @Transactional()
    public async get(principal: Principal, rid: Forge.Build.Rid): Promise<BuildWithJobs | null> {
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
            jobs:  await this._toDomain(jobs),
        };
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

    @Transactional()
    public async getJob(principal: Principal, rid: Forge.Job.Rid): Promise<Forge.Job.Schema | null> {
        const row = await this.trx
            .selectFrom('forge.job')
            .selectAll()
            .where('rid', '=', rid)
            .executeTakeFirst();

        if (!row)
            return null;

        const jobs = await this._toDomain([row]);

        return jobs[row.rid];
    }

    /** The output transactions of the build's unfinished jobs — what cancelling aborts. */
    @Transactional()
    public async listUnfinishedOutputs(principal: Principal, rid: Forge.Build.Rid): Promise<OpenedOutput[]> {
        const rows = await this.trx
            .selectFrom('forge.job_output_transaction as output')
            .innerJoin('forge.job as job', 'job.rid', 'output.job_rid')
            .select(['output.dataset_rid', 'output.transaction_rid'])
            .where('job.build_rid', '=', rid)
            .where('job.status', 'in', ['waiting', 'running'])
            .execute();

        return rows.map((row) => ({ datasetRid: row.dataset_rid, transactionRid: row.transaction_rid }));
    }

    /** The build and its unfinished jobs, canceled. False if it had already finished. */
    @Transactional()
    public async cancel(principal: Principal, rid: Forge.Build.Rid): Promise<boolean> {
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

    /** Jobs with their pinned inputs and opened outputs, by RID. */
    private async _toDomain(jobs: ForgeDB.Job.Row[]): Promise<Record<Forge.Job.Rid, Forge.Job.Schema>> {
        if (jobs.length === 0)
            return {};

        const rids = jobs.map((job) => job.rid);

        const inputs = await this.trx
            .selectFrom('forge.job_input_transaction')
            .selectAll()
            .where('job_rid', 'in', rids)
            .execute();

        const outputs = await this.trx
            .selectFrom('forge.job_output_transaction')
            .selectAll()
            .where('job_rid', 'in', rids)
            .execute();

        const byRid: Record<Forge.Job.Rid, Forge.Job.Schema> = {};

        for (const job of jobs)
            byRid[job.rid] = ForgeDB.Job.toDomain(
                job,
                inputs.filter((input) => input.job_rid === job.rid),
                outputs.filter((output) => output.job_rid === job.rid),
            );

        return byRid;
    }
}
