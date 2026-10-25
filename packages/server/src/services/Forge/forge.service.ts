import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Catalog, Forge, Foundations } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import type { Principal } from '@/auth/principal';
import { CatalogService } from '@/services/Catalog/catalog.service';
import { GatekeeperService } from '@/services/Gatekeeper/gatekeeper.service';
import { BuildRepository, type BuildWithJobs, type OpenedOutput, type ResolvedJob } from './build/build.repository';
import { JobSpecs } from './job-spec/job-specs';

const MAIN = Foundations.Branch.parse('main');

/**
 * Forge's one entry point for other services: builds here, job specs under
 * `jobSpecs` (publish, getCurrent).
 *
 * Creating a build resolves its target into jobs and opens a snapshot
 * transaction on every output — so no other writer touches them meanwhile.
 * Nothing runs the jobs yet: they wait until the build is canceled.
 */
@Injectable()
export class ForgeService {

    private readonly log = System.log.withContext('Forge');

    constructor(
        public readonly gatekeeper:   GatekeeperService,
        public readonly jobSpecs:     JobSpecs,
        private readonly catalog:     CatalogService,
        private readonly repository:  BuildRepository,
    ) {}

    /**
     * A manual build: each target's current spec (on the branch, then its
     * fallbacks) becomes one job; a spec writing several targets is one job.
     * Needs write on every output and read on every input.
     */
    public async createBuild(principal: Principal, request: Forge.API.CreateBuild.Request): Promise<BuildWithJobs> {
        if (request.target.type !== 'manual')
            throw new BadRequestException('Only manual builds for now');

        if (request.branch !== MAIN)
            throw new BadRequestException('Builds run on main until datasets have other branches');

        const specs = await this._resolveSpecs(principal, request.target.datasetRids, [request.branch, ...request.fallbackBranches]);

        await this._checkSpecs(principal, specs);

        const buildRid = Forge.Build.createRid();
        const jobs = await this._openOutputs(principal, buildRid, specs);

        try {
            const created = await this.repository.create(principal, {
                rid:              buildRid,
                branch:           request.branch,
                fallbackBranches: request.fallbackBranches,
                target:           request.target,
                forceBuild:       request.forceBuild,
                abortOnFailure:   request.abortOnFailure,
                retryCount:       request.retryCount,
                jobs,
            });

            this.log.info(`Created ${buildRid}: ${jobs.length} job(s)`);

            return created;
        }
        catch (error) {
            await this._abort(principal, jobs.flatMap((job) => job.outputs));

            throw error;
        }
    }

    /** Builds the principal can see (RLS: discover on a target), newest first. */
    public async listBuilds(principal: Principal, query: Forge.API.ListBuilds.Query): Promise<Forge.Build.Schema[]> {
        return this.repository.list(principal, query);
    }

    public async getBuild(principal: Principal, rid: Forge.Build.Rid): Promise<BuildWithJobs> {
        const found = await this.repository.get(principal, rid);

        if (!found)
            throw new NotFoundException('Not found');

        return found;
    }

    /** Aborts the unfinished jobs' transactions, then marks them and the build canceled (RLS: write on every target). */
    public async cancelBuild(principal: Principal, rid: Forge.Build.Rid): Promise<BuildWithJobs> {
        const { build } = await this.getBuild(principal, rid);

        if (build.status !== 'running')
            throw new ConflictException(`Build is ${build.status}`);

        const outputs = await this.repository.listUnfinishedOutputs(principal, rid);

        await this._abort(principal, outputs);

        const canceled = await this.repository.cancel(principal, rid);

        if (!canceled)
            throw new ConflictException('Build finished meanwhile');

        this.log.info(`Canceled ${rid}`);

        return this.getBuild(principal, rid);
    }

    public async getJob(principal: Principal, rid: Forge.Job.Rid): Promise<Forge.Job.Schema> {
        const job = await this.repository.getJob(principal, rid);

        if (!job)
            throw new NotFoundException('Not found');

        return job;
    }

    /** Each target's current spec, without duplicates. A target nothing produces is a conflict. */
    private async _resolveSpecs(
        principal:   Principal,
        datasetRids: Catalog.Dataset.Rid[],
        branches:    Foundations.Branch[],
    ): Promise<Forge.JobSpec.Schema[]> {
        const specs: Record<Forge.JobSpec.Rid, Forge.JobSpec.Schema> = {};

        for (const datasetRid of datasetRids) {
            await this.catalog.get(principal, datasetRid);

            const spec = await this.jobSpecs.getCurrent(principal, datasetRid, branches);

            if (!spec)
                throw new ConflictException(`Nothing builds ${datasetRid} on ${branches.join(' or ')}`);

            specs[spec.rid] = spec;
        }

        return Object.values(specs);
    }

    /**
     * Write on every output, read on every input; an input not built in this
     * build must have data already.
     */
    private async _checkSpecs(principal: Principal, specs: Forge.JobSpec.Schema[]): Promise<void> {
        const builtHere = new Set(specs.flatMap((spec) => spec.outputDatasetRids));

        for (const spec of specs) {
            for (const datasetRid of spec.outputDatasetRids)
                await this.gatekeeper.assert(principal, 'write', datasetRid);

            for (const datasetRid of spec.inputDatasetRids) {
                await this.gatekeeper.assert(principal, 'read', datasetRid);

                if (builtHere.has(datasetRid))
                    continue;

                const input = await this.catalog.get(principal, datasetRid);

                if (input.lastSequence === 0)
                    throw new ConflictException(`Input ${datasetRid} has no data yet`);
            }
        }
    }

    /** One job per spec, with a snapshot transaction open on each output — all opened in one database transaction, or none. */
    private async _openOutputs(principal: Principal, buildRid: Forge.Build.Rid, specs: Forge.JobSpec.Schema[]): Promise<ResolvedJob[]> {
        const planned = specs.map((spec) => ({ rid: Forge.Job.createRid(), spec }));

        const openings = planned.flatMap((job) => job.spec.outputDatasetRids.map((datasetRid) => ({
            datasetRid,
            type:       'snapshot' as const,
            provenance: { buildRid, jobRid: job.rid },
        })));

        const transactions = await this.catalog.transaction.openBatch(principal, openings, MAIN);
        const byDataset = new Map(transactions.map((transaction) => [transaction.datasetRid, transaction.rid]));

        return planned.map((job) => ({
            rid:        job.rid,
            jobSpecRid: job.spec.rid,
            outputs:    job.spec.outputDatasetRids.map((datasetRid) => ({
                datasetRid,
                transactionRid: this._getOpened(byDataset, datasetRid),
            })),
        }));
    }

    private _getOpened(byDataset: Map<Catalog.Dataset.Rid, Catalog.Transaction.Rid>, datasetRid: Catalog.Dataset.Rid): Catalog.Transaction.Rid {
        const transactionRid = byDataset.get(datasetRid);

        if (!transactionRid)
            throw new Error(`No transaction was opened on ${datasetRid}`);

        return transactionRid;
    }

    /** Best effort: a transaction left open is aborted by Catalog's storage GC later. */
    private async _abort(principal: Principal, outputs: OpenedOutput[]): Promise<void> {
        for (const output of outputs)
            try {
                await this.catalog.transaction.abort(principal, output.datasetRid, output.transactionRid);
            }
            catch (error) {
                this.log.warning('Could not abort a transaction', {
                    transactionRid: output.transactionRid,
                    error:          error instanceof Error ? error.message : String(error),
                });
            }
    }
}
