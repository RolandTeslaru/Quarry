import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Forge, Foundations } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import type { Principal } from '@/auth/principal';
import { CatalogService } from '@/services/Catalog/catalog.service';
import { GatekeeperService } from '@/services/Gatekeeper/gatekeeper.service';
import { RealtimeService } from '@/services/Realtime/realtime.service';
import { ForgeRelayService } from './relay/forge-relay.service';
import { ForgeRepository, type NewJob } from './forge.repository';
import { JobSpecs } from './job-specs';

const MAIN = Foundations.Branch.parse('main');

/** A build's plan with the specs it names, by RID. */
interface CollectedPlan {
    readonly plan:  Forge.Build.Plan.Schema;
    readonly specs: Record<Forge.JobSpec.Rid, Forge.JobSpec.Schema>;
}

/**
 * Forge's one entry point for other services: builds here, job specs under
 * `jobSpecs` (publish, getCurrent).
 *
 * Initializing a build: collect its plan, validate it, lock its outputs (a
 * snapshot transaction on each, so no other writer gets in), persist it with
 * its roots scheduled, relay them to the queue. Running the jobs is the
 * ForgeAgents' side: agent/ForgeAgentService.
 */
@Injectable()
export class ForgeService {

    private readonly log = System.log.withContext('Forge');

    constructor(
        public readonly gatekeeper:  GatekeeperService,
        public readonly jobSpecs:    JobSpecs,
        private readonly catalog:    CatalogService,
        private readonly repository: ForgeRepository,
        private readonly relay:      ForgeRelayService,
        private readonly realtime:   RealtimeService,
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
            const created = await this.repository.initializeBuild(
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

            // 5. After the commit: announce the jobs, hand the roots to the queue.
            for (const job of Object.values(created.jobs))
                this.realtime.emitEvent({
                    ...Forge.Event.create('forge:job:updated', { job: job }),
                    channel: Forge.Event.getChannel(job.buildRid),
                });

            await this.relay.relay(Object.values(created.jobs).filter((job) => job.status === 'scheduled'));

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
        return this.repository.listBuilds(principal, query);
    }

    public async getBuild(principal: Principal, rid: Forge.Build.Rid): Promise<Forge.API.GetBuild.Response> {
        const found = await this.repository.getBuild(principal, rid);

        if (!found)
            throw new NotFoundException('Not found');

        return found;
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

        if (build.status !== 'running')
            throw new ConflictException(`Build is ${build.status}`);

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
        const job = await this.repository.getJob(principal, rid);

        if (!job)
            throw new NotFoundException('Not found');

        return job;
    }

    // ── creating a build, phase by phase ────────────────────────────────

    /**
     * 1. Every spec the build needs, as an adjacency list. Manual: the
     * targets' own specs (a spec writing several targets is one node) — no
     * walking upstream. A target nothing produces is a conflict.
     */
    private async _collectPlan(principal: Principal, request: Forge.API.CreateBuild.Request): Promise<CollectedPlan> {
        if (request.target.type !== 'manual')
            throw new BadRequestException('Only manual builds for now');

        const branches = [request.branch, ...request.fallbackBranches];
        const specs: Record<Forge.JobSpec.Rid, Forge.JobSpec.Schema> = {};

        for (const datasetRid of request.target.datasetRids) {
            await this.catalog.get(principal, datasetRid);

            const spec = await this.jobSpecs.getCurrent(principal, datasetRid, branches);

            if (!spec)
                throw new ConflictException(`Nothing builds ${datasetRid} on ${branches.join(' or ')}`);

            specs[spec.rid] = spec;
        }

        const plan = this._getPlan(Object.values(specs));

        // A cycle with no way in leaves no roots; D2 will catch every cycle.
        if (plan.roots.length === 0)
            throw new ConflictException('The specs to build read each other\'s outputs in a cycle');

        return { plan, specs };
    }

    /**
     * 2. Write on every output, read on every input; an input not built in
     * this build must have data already.
     */
    private async _validatePlan(principal: Principal, { specs }: CollectedPlan): Promise<void> {
        const builtHere = new Set(Object.values(specs).flatMap((spec) => spec.outputDatasetRids));

        for (const spec of Object.values(specs)) {
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

    /**
     * 3. One job per node, with a snapshot transaction open on each of its spec's
     * outputs — all opened in one database transaction, or none.
     */
    private async _lockOutputs(principal: Principal, buildRid: Forge.Build.Rid, { specs }: CollectedPlan): Promise<NewJob[]> {
        const jobSpecRids = Object.values(specs).map((spec) => spec.rid);
        const jobRids = new Map(jobSpecRids.map((jobSpecRid) => [jobSpecRid, Forge.Job.createRid()]));

        const openings = jobSpecRids.flatMap((jobSpecRid) => specs[jobSpecRid].outputDatasetRids.map((datasetRid) => ({
            datasetRid,
            type:       'snapshot' as const,
            provenance: { buildRid, jobRid: jobRids.get(jobSpecRid) },
        })));

        const transactions = await this.catalog.transaction.openBatch(principal, openings, MAIN);

        return jobSpecRids.map((jobSpecRid) => ({
            rid:     this._getJobRid(jobRids, jobSpecRid),
            jobSpecRid,
            outputs: Object.fromEntries(transactions
                .filter((transaction) => specs[jobSpecRid].outputDatasetRids.includes(transaction.datasetRid))
                .map((transaction) => [transaction.datasetRid, transaction.rid])),
        }));
    }

    // ── helpers ─────────────────────────────────────────────────────────

    /**
     * The plan as an adjacency list: a spec is the child of each spec in the
     * build that writes one of its inputs; specs with no parent are the roots.
     */
    private _getPlan(specs: Forge.JobSpec.Schema[]): Forge.Build.Plan.Schema {
        const producers = new Map(specs.flatMap((spec) => spec.outputDatasetRids.map((datasetRid) => [datasetRid, spec.rid] as const)));
        const children: Record<Forge.JobSpec.Rid, Forge.JobSpec.Rid[]> = {};
        const hasParent = new Set<Forge.JobSpec.Rid>();

        for (const spec of specs)
            children[spec.rid] = [];

        for (const spec of specs) {
            const parents = new Set(spec.inputDatasetRids.flatMap((datasetRid) => producers.get(datasetRid) ?? []));

            for (const parent of parents) {
                if (parent === spec.rid)
                    continue;

                children[parent].push(spec.rid);
                hasParent.add(spec.rid);
            }
        }

        return {
            roots: specs.map((spec) => spec.rid).filter((rid) => !hasParent.has(rid)),
            children,
        };
    }

    private _getJobRid(jobRids: Map<Forge.JobSpec.Rid, Forge.Job.Rid>, jobSpecRid: Forge.JobSpec.Rid): Forge.Job.Rid {
        const jobRid = jobRids.get(jobSpecRid);

        if (!jobRid)
            throw new Error(`No job for ${jobSpecRid}`);

        return jobRid;
    }
}
