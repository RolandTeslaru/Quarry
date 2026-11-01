import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Catalog, Dataset, Forge, Foundations } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { GatekeeperService } from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.service';
import { RealtimeService } from '@quarry/platform-kernel/services/Realtime/realtime.service';
import { DurableQueueHandle, InjectDurableQueue } from '@quarry/platform-kernel/infra/durable-queue';
import { CatalogClient } from '@quarry/platform-kernel/microservice/clients';
import { ForgeRepository } from './repository/forge.repository';
import type { PlannedJob } from './repository/job.repository';
import { RecipeService } from '../recipe/recipe.service';


/** ForgeAgents act through the server as the system: they carry no user. */
export const AGENT = Principal.SELF('forge.agent');

/**
 * Forge's one entry point for other services: builds here, recipes under
 * `recipes` (publish, getCurrent).
 *
 * Initializing a build: its plan from the targets' recipes, validated, its outputs locked (a
 * snapshot transaction on each, so no other writer gets in), persisted with
 * its roots scheduled (their messages in the outbox), relayed. Running the jobs is the
 * ForgeAgents' side: they claim and heartbeat through JobService, and finish here (finishJob), which advances the build.
 */
@Injectable()
export class ForgeService {

    private readonly log = System.log.withContext('Forge');

    constructor(
        public readonly gatekeeper:  GatekeeperService,
        public readonly recipes:     RecipeService,
        private readonly catalog:    CatalogClient,
        private readonly repository: ForgeRepository,
        private readonly realtime:   RealtimeService,
        @InjectDurableQueue(Forge.DurableQueue.RunJob)
        private readonly runJobQueue: DurableQueueHandle<typeof Forge.Queue.RunJob.Definition>,
    ) {}

    /** Needs write on every output and read on every input. */
    public async initializeBuild(principal: Principal, request: Forge.API.CreateBuild.Request): Promise<Forge.API.CreateBuild.Response> {
        if (request.branch !== Foundations.MAIN_BRANCH)
            throw new BadRequestException('Builds run on main until datasets have other branches');

        if (request.target.type !== 'manual')
            throw new BadRequestException('Only manual builds for now');

        // A target the principal can't see is a 404 — read first, as RLS would hide its recipe and it'd read as nothing builds it.
        for (const datasetRid of request.target.datasetRids)
            await this.catalog.get(principal, { rid: datasetRid });

        // 1. The targets' own recipes, as an adjacency list — no walking upstream.
        const branches = [request.branch, ...request.fallbackBranches];
        const recipes = await this.recipes.getCurrentForEach(principal, request.target.datasetRids, branches);
        let plan: Forge.Build.Plan;

        try {
            plan = Forge.Build.Plan.create(recipes);
        }
        catch (error) {
            if (error instanceof Forge.Build.Plan.CycleError)
                throw new ConflictException(error.message);

            throw error;
        }

        await this.validatePlan(principal, recipes);

        const buildRid = Forge.Build.createRid();
        const plannedJobs = await this.openTransactionsForOutputs(principal, buildRid, recipes);

        try {
            const jobs = await this.repository.initializeBuild(
                principal,
                {
                    rid:              buildRid,
                    branch:           request.branch,
                    fallbackBranches: request.fallbackBranches,
                    target:           request.target,
                    plan,
                    forceBuild:       request.forceBuild,
                    onJobFailure:     request.onJobFailure,
                    retryCount:       request.retryCount,
                },
                plannedJobs,
            );

            this.log.info(`Created ${buildRid}: ${Object.keys(jobs).length} job(s)`);

            // 5. After the commit: announce the jobs, relay the roots' messages.
            for (const job of Object.values(jobs))
                this.realtime.emitEvent({
                    ...Forge.Event.create('forge:job:updated', { job: job }),
                    channel: Forge.Event.getChannel(job.buildRid),
                });

            await this.runJobQueue.relay();

            return this.getBuild(principal, buildRid);
        }
        catch (error) {
            // Cleanup on a failure path: if this fails too, Catalog's storage GC aborts them later.
            await this.catalog.abortTransactions(principal, { transactions: Forge.Job.getOutputTransactions(Object.values(plannedJobs)) }).catch(() => undefined);

            throw error;
        }
    }

    /** Builds the principal can see (RLS: discover on a target), newest first. */
    public async listBuilds(principal: Principal, query: Forge.API.ListBuilds.Query): Promise<Forge.Build[]> {
        return this.repository.build.list(principal, query);
    }

    /** The build and its jobs — two reads, no shared snapshot needed: a job that moves in between shows up via realtime. */
    public async getBuild(principal: Principal, rid: Forge.Build.Rid): Promise<Forge.API.GetBuild.Response> {
        const build = await this.repository.build.get(principal, rid);

        if (!build)
            throw new NotFoundException('Not found');

        const jobs: Forge.API.GetBuild.Response['jobs'] = {};

        for (const job of await this.repository.job.listByBuild(principal, rid))
            jobs[job.rid] = job;

        return { build, jobs };
    }

    /**
     * Marks the build and its unfinished jobs canceled, then aborts those jobs'
     * transactions. Needs write on every target — asserted first: under RLS alone
     * a viewer's cancel would match no rows and read as "finished meanwhile".
     */
    public async cancelBuild(principal: Principal, rid: Forge.Build.Rid): Promise<Forge.API.CancelBuild.Response> {
        const { build } = await this.getBuild(principal, rid);

        for (const datasetRid of build.target.datasetRids)
            await this.gatekeeper.assert(principal, 'write', datasetRid);

        // Mark first: a canceled job's late finish is refused (finish needs it running), so an
        // agent can't complete it once its outputs are being released.
        const canceled = await this.repository.cancelBuild(principal, rid);

        if (!canceled)
            throw new ConflictException('Build finished meanwhile');

        for (const job of canceled)
            this.realtime.emitEvent({
                ...Forge.Event.create('forge:job:updated', { job }),
                channel: Forge.Event.getChannel(job.buildRid),
            });

        await this.catalog.abortTransactions(principal, { transactions: Forge.Job.getOutputTransactions(canceled) });

        this.log.info(`Canceled ${rid}`);

        return this.getBuild(principal, rid);
    }

    /**
     * Records how the running attempt ended and advances its build: on success its outputs
     * are committed and ready children scheduled and relayed; a failure aborts its outputs
     * and cancels what the build's `onJobFailure` says. 409 if this attempt isn't the one running — another attempt's,
     * or its build was canceled meanwhile.
     */
    public async finishJob(rid: Forge.Job.Rid, outcome: Forge.API.Agent.Finish.Request): Promise<Forge.API.Agent.Finish.Response> {
        const finished = await this.repository.finishJob(AGENT, rid, outcome);

        if (!finished)
            throw new ConflictException(`Job ${rid} attempt ${outcome.attempt} isn't running`);

        // Announced in the order they were committed: this job (and the children it scheduled), then what failing cancels.
        for (const changed of [finished.job, ...finished.scheduled])
            this.realtime.emitEvent({
                ...Forge.Event.create('forge:job:updated', { job: changed }),
                channel: Forge.Event.getChannel(changed.buildRid),
            });

        // A succeeded job's outputs were committed with it; a failed one's are released.
        if (outcome.status === 'failed') {
            await this.catalog.abortTransactions(AGENT, { transactions: finished.job.outputs });
            await this.cancelForFailure(finished.job);
        }

        this.log.info(`Finished ${rid}: ${outcome.status}, ${finished.scheduled.length} job(s) scheduled`);

        await this.runJobQueue.relay();

        return { job: finished.job };
    }

    /** Cancels what the failed job's build says a failure cancels (its descendants, or the build), then aborts those jobs' transactions. */
    private async cancelForFailure(failed: Forge.Job): Promise<void> {
        // Mark first, as canceling does: a canceled job's late finish is refused.
        const canceled = await this.repository.cancelForFailure(AGENT, failed);

        for (const job of canceled)
            this.realtime.emitEvent({
                ...Forge.Event.create('forge:job:updated', { job }),
                channel: Forge.Event.getChannel(job.buildRid),
            });

        await this.catalog.abortTransactions(AGENT, { transactions: Forge.Job.getOutputTransactions(canceled) });
    }

    // ── creating a build, phase by phase ────────────────────────────────

    /**
     * 2. Write on every output, read on every input; an input not built in
     * this build must have data already.
     */
    private async validatePlan(principal: Principal, recipes: Record<Forge.Recipe.Rid, Forge.Recipe>): Promise<void> {
        const outputs = new Set<Dataset.Rid>();
        const inputs = new Set<Dataset.Rid>();

        for (const recipe of Object.values(recipes)) {
            for (const datasetRid of recipe.outputDatasetRids)
                outputs.add(datasetRid);

            for (const datasetRid of recipe.inputDatasetRids)
                inputs.add(datasetRid);
        }

        await this.gatekeeper.assertAll(principal, 'write', outputs);
        await this.gatekeeper.assertAll(principal, 'read', inputs);

        // An input this build doesn't write must have data already.
        const externalInputs: Dataset.Rid[] = [];

        for (const datasetRid of inputs)
            if (!outputs.has(datasetRid))
                externalInputs.push(datasetRid);

        await this.catalog.assertNotEmpty(principal, { datasetRids: externalInputs });
    }

    /**
     * 3. One job per node, with a snapshot transaction open on each of its recipe's
     * outputs — all opened in one database transaction, or none.
     */
    private async openTransactionsForOutputs(principal: Principal, buildRid: Forge.Build.Rid, recipes: Record<Forge.Recipe.Rid, Forge.Recipe>): Promise<Record<Forge.Job.Rid, PlannedJob>> {
        const jobs: Record<Forge.Job.Rid, PlannedJob> = {};
        const openings: Record<Dataset.Rid, Catalog.Transaction.Opening> = {};

        for (const recipe of Object.values(recipes)) {
            const job: PlannedJob = { rid: Forge.Job.createRid(), recipeRid: recipe.rid, outputs: {} };

            jobs[job.rid] = job;

            for (const datasetRid of recipe.outputDatasetRids)
                openings[datasetRid] = { type: 'snapshot', provenance: { buildRid, jobRid: job.rid } };
        }

        const transactions = await this.catalog.openTransactions(principal, { openings, branch: Foundations.MAIN_BRANCH });

        for (const job of Object.values(jobs))
            for (const datasetRid of recipes[job.recipeRid].outputDatasetRids)
                job.outputs[datasetRid] = transactions[datasetRid].rid;

        return jobs;
    }
}
