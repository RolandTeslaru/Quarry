import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Forge, Foundations } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import type { Principal } from '@/auth/principal';
import { CatalogService } from '@/services/Catalog/catalog.service';
import { GatekeeperService } from '@/services/Gatekeeper/gatekeeper.service';
import { RealtimeService } from '@/services/Realtime/realtime.service';
import { DurableQueueHandle, InjectDurableQueue } from '@/infra/durable-queue';
import { ForgeRepository } from './repository/forge.repository';
import type { NewJob } from './repository/job.repository';
import { Recipes } from './recipes';

const MAIN = Foundations.Branch.parse('main');

/** A build's plan with the recipes it names, by RID. */
interface CollectedPlan {
    readonly plan:  Forge.Build.Plan.Schema;
    readonly recipes: Record<Forge.Recipe.Rid, Forge.Recipe.Schema>;
}

/**
 * Forge's one entry point for other services: builds here, recipes under
 * `recipes` (publish, getCurrent).
 *
 * Initializing a build: collect its plan, validate it, lock its outputs (a
 * snapshot transaction on each, so no other writer gets in), persist it with
 * its roots scheduled (their messages in the outbox), relay them. Running the jobs is the
 * ForgeAgents' side: agent/ForgeAgentService.
 */
@Injectable()
export class ForgeService {

    private readonly log = System.log.withContext('Forge');

    constructor(
        public readonly gatekeeper:  GatekeeperService,
        public readonly recipes:    Recipes,
        private readonly catalog:    CatalogService,
        private readonly repository: ForgeRepository,
        private readonly realtime:   RealtimeService,
        @InjectDurableQueue(Forge.DurableQueue.RunJob)
        private readonly runJobQueue: DurableQueueHandle<typeof Forge.Queue.RunJob.Definition>,
    ) {}

    /** Needs write on every output and read on every input. */
    public async initializeBuild(principal: Principal, request: Forge.API.CreateBuild.Request): Promise<Forge.API.CreateBuild.Response> {
        if (request.branch !== MAIN)
            throw new BadRequestException('Builds run on main until datasets have other branches');

        const collected = await this._collectPlan(principal, request);

        await this._validatePlan(principal, collected);

        const buildRid = Forge.Build.createRid();
        const jobs = await this._lockOutputs(principal, buildRid, collected);

        try {
            const createdJobs = await this.repository.initializeBuild(
                principal,
                {
                    rid:              buildRid,
                    branch:           request.branch,
                    fallbackBranches: request.fallbackBranches,
                    target:           request.target,
                    plan:             collected.plan,
                    forceBuild:       request.forceBuild,
                    abortOnFailure:   request.abortOnFailure,
                    retryCount:       request.retryCount,
                },
                jobs,
            );

            this.log.info(`Created ${buildRid}: ${jobs.length} job(s)`);

            // 5. After the commit: announce the jobs, relay the roots' messages.
            for (const job of createdJobs)
                this.realtime.emitEvent({
                    ...Forge.Event.create('forge:job:updated', { job: job }),
                    channel: Forge.Event.getChannel(job.buildRid),
                });

            await this.runJobQueue.relay();

            return this.getBuild(principal, buildRid);
        }
        catch (error) {
            // Cleanup on a failure path: if this fails too, Catalog's storage GC aborts them later.
            await this.catalog.transaction.abortBatch(principal, jobs.flatMap(Forge.Job.getOutputTransactions)).catch(() => undefined);

            throw error;
        }
    }

    /** Builds the principal can see (RLS: discover on a target), newest first. */
    public async listBuilds(principal: Principal, query: Forge.API.ListBuilds.Query): Promise<Forge.Build.Schema[]> {
        return this.repository.build.list(principal, query);
    }

    /** The build and its jobs — two reads, no shared snapshot needed: a job that moves in between shows up via realtime. */
    public async getBuild(principal: Principal, rid: Forge.Build.Rid): Promise<Forge.API.GetBuild.Response> {
        const build = await this.repository.build.get(principal, rid);

        if (!build)
            throw new NotFoundException('Not found');

        const jobs = await this.repository.job.listForBuild(principal, rid);

        return {
            build,
            jobs: Object.fromEntries(jobs.map((job) => [job.rid, job])),
        };
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

        await this.catalog.transaction.abortBatch(principal, canceled.flatMap(Forge.Job.getOutputTransactions));

        this.log.info(`Canceled ${rid}`);

        return this.getBuild(principal, rid);
    }

    public async getJob(principal: Principal, rid: Forge.Job.Rid): Promise<Forge.Job.Schema> {
        const job = await this.repository.job.get(principal, rid);

        if (!job)
            throw new NotFoundException('Not found');

        return job;
    }

    // ── creating a build, phase by phase ────────────────────────────────

    /**
     * 1. Every recipe the build needs, as an adjacency list. Manual: the
     * targets' own recipes (a recipe writing several targets is one node) — no
     * walking upstream. A target nothing produces is a conflict.
     */
    private async _collectPlan(principal: Principal, request: Forge.API.CreateBuild.Request): Promise<CollectedPlan> {
        if (request.target.type !== 'manual')
            throw new BadRequestException('Only manual builds for now');

        const branches = [request.branch, ...request.fallbackBranches];
        const recipes: Record<Forge.Recipe.Rid, Forge.Recipe.Schema> = {};

        for (const datasetRid of request.target.datasetRids) {
            await this.catalog.get(principal, datasetRid);

            const recipe = await this.recipes.getCurrent(principal, datasetRid, branches);

            if (!recipe)
                throw new ConflictException(`Nothing builds ${datasetRid} on ${branches.join(' or ')}`);

            recipes[recipe.rid] = recipe;
        }

        const plan = this._getPlan(Object.values(recipes));

        // A cycle with no way in leaves no roots; D2 will catch every cycle.
        if (plan.roots.length === 0)
            throw new ConflictException('The recipes to build read each other\'s outputs in a cycle');

        return { plan, recipes };
    }

    /**
     * 2. Write on every output, read on every input; an input not built in
     * this build must have data already.
     */
    private async _validatePlan(principal: Principal, { recipes }: CollectedPlan): Promise<void> {
        const builtHere = new Set(Object.values(recipes).flatMap((recipe) => recipe.outputDatasetRids));

        for (const recipe of Object.values(recipes)) {
            for (const datasetRid of recipe.outputDatasetRids)
                await this.gatekeeper.assert(principal, 'write', datasetRid);

            for (const datasetRid of recipe.inputDatasetRids) {
                await this.gatekeeper.assert(principal, 'read', datasetRid);

                if (builtHere.has(datasetRid))
                    continue;

                const input = await this.catalog.get(principal, datasetRid);

                if (input.lastSequence === 0)
                    throw new ConflictException(`Input ${datasetRid} has no data yet`);
            }
        }
    }

    /**
     * 3. One job per node, with a snapshot transaction open on each of its recipe's
     * outputs — all opened in one database transaction, or none.
     */
    private async _lockOutputs(principal: Principal, buildRid: Forge.Build.Rid, { recipes }: CollectedPlan): Promise<NewJob[]> {
        const recipeRids = Object.values(recipes).map((recipe) => recipe.rid);
        const jobRids: Record<Forge.Recipe.Rid, Forge.Job.Rid> = {};

        for (const recipeRid of recipeRids)
            jobRids[recipeRid] = Forge.Job.createRid();

        const openings = recipeRids.flatMap((recipeRid) => recipes[recipeRid].outputDatasetRids.map((datasetRid) => ({
            datasetRid,
            type:       'snapshot' as const,
            provenance: { buildRid, jobRid: jobRids[recipeRid] },
        })));

        const transactions = await this.catalog.transaction.openBatch(principal, openings, MAIN);

        return recipeRids.map((recipeRid) => ({
            rid:     jobRids[recipeRid],
            recipeRid,
            outputs: Object.fromEntries(transactions
                .filter((transaction) => recipes[recipeRid].outputDatasetRids.includes(transaction.datasetRid))
                .map((transaction) => [transaction.datasetRid, transaction.rid])),
        }));
    }

    // ── helpers ─────────────────────────────────────────────────────────

    /**
     * The plan as an adjacency list: a recipe is the child of each recipe in the
     * build that writes one of its inputs; recipes with no parent are the roots.
     */
    private _getPlan(recipes: Forge.Recipe.Schema[]): Forge.Build.Plan.Schema {
        const producers = new Map(recipes.flatMap((recipe) => recipe.outputDatasetRids.map((datasetRid) => [datasetRid, recipe.rid] as const)));
        const children: Record<Forge.Recipe.Rid, Forge.Recipe.Rid[]> = {};
        const hasParent = new Set<Forge.Recipe.Rid>();

        for (const recipe of recipes)
            children[recipe.rid] = [];

        for (const recipe of recipes) {
            const parents = new Set(recipe.inputDatasetRids.flatMap((datasetRid) => producers.get(datasetRid) ?? []));

            for (const parent of parents) {
                if (parent === recipe.rid)
                    continue;

                children[parent].push(recipe.rid);
                hasParent.add(recipe.rid);
            }
        }

        return {
            roots: recipes.map((recipe) => recipe.rid).filter((rid) => !hasParent.has(rid)),
            children,
        };
    }
}
