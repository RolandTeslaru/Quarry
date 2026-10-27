import { randomUUID } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue } from 'bullmq';
import { sql } from 'kysely';
import { Catalog, Forge, Foundations, type Gatekeeper, Identity, type Library } from '@quarry/shared/domain';
import { QUEUE_PREFIX, redisConnection } from '@quarry/shared/server/redis';
import { ApiModule } from '@/api.module';
import type { Principal } from '@/auth/principal';
import { db, destroyPool } from '@/db/pool';
import { CatalogService } from '@/services/Catalog/catalog.service';
import { GatekeeperService } from '@/services/Gatekeeper/gatekeeper.service';
import { ForgeAgentService } from '@/services/Forge/agent/forge-agent.service';
import { ForgeService } from '@/services/Forge/forge.service';
import { ForgeRelayService } from '@/services/Forge/relay/forge-relay.service';
import { LibraryService } from '@/services/Library/library.service';

export const MAIN = Foundations.Branch.parse('main');

/** A spec to publish, by dataset name: what it reads, what it writes. */
export interface SpecShape {
    readonly name:    string;
    readonly inputs:  string[];
    readonly outputs: string[];
}

/**
 * The server's services in one Nest context, against the test database and
 * Redis (test/support/env.ts), plus what Forge tests need around them.
 */
export class ForgeHarness {

    public readonly forge:   ForgeService;
    public readonly agent:   ForgeAgentService;
    public readonly relay:   ForgeRelayService;
    public readonly catalog: CatalogService;
    public readonly library: LibraryService;
    public readonly gatekeeper: GatekeeperService;

    /** The ForgeAgents' queue, to see what was pushed. */
    public readonly runJobs = new Queue(Forge.Queue.RunJob.Definition.name, { connection: redisConnection(), prefix: QUEUE_PREFIX });

    private constructor(private readonly app: INestApplicationContext) {
        this.forge = app.get(ForgeService);
        this.agent = app.get(ForgeAgentService);
        this.relay = app.get(ForgeRelayService);
        this.catalog = app.get(CatalogService);
        this.library = app.get(LibraryService);
        this.gatekeeper = app.get(GatekeeperService);
    }

    /** Get the Nest context's other services. */
    public get<T>(type: new (...args: never[]) => T): T {
        return this.app.get(type);
    }

    public static async start(): Promise<ForgeHarness> {
        return new ForgeHarness(await NestFactory.createApplicationContext(ApiModule, { logger: false }));
    }

    public async stop(): Promise<void> {
        await this.runJobs.close();
        await this.app.close();
        await destroyPool();
    }

    /** A workspace member (an admin by default: owner of everything), inserted directly. */
    public async createUser(workspaceRole: Identity.User.WorkspaceRole = 'admin'): Promise<Principal.User> {
        const userRid = Identity.User.fromAuthId(randomUUID());

        await sql`
            insert into identity."user" (rid, email, display_name, workspace_role)
            values (${userRid}, ${`${userRid}@test.quarry`}, 'Test user', ${workspaceRole})`.execute(db());

        return { type: 'user', userRid, workspaceRole };
    }

    /**
     * A project with a dataset per name. Datasets named in `withData` get one
     * committed version (a registered file, never read), so builds may use them as inputs.
     */
    public async createDatasets(
        principal: Principal.User,
        names:     string[],
        withData:  string[] = [],
    ): Promise<{ projectRid: Catalog.Dataset.Schema['parentRid']; datasets: Record<string, Catalog.Dataset.Rid> }> {
        const project = await this.library.createProject(principal, { name: `Test ${randomUUID()}`, description: null });
        const datasets: Record<string, Catalog.Dataset.Rid> = {};

        for (const name of names) {
            const dataset = await this.catalog.createDataset(principal, { parentRid: project.rid, name, description: null });

            datasets[name] = dataset.rid;

            if (withData.includes(name))
                await this._commitVersion(principal, dataset.rid);
        }

        return { projectRid: project.rid, datasets };
    }

    /** Publishes the specs, producer = the project (any library resource will do). Returns them by spec name. */
    public async publish(
        principal:   Principal.User,
        producerRid: Catalog.Dataset.Schema['parentRid'],
        datasets:    Record<string, Catalog.Dataset.Rid>,
        shapes:      SpecShape[],
        branch:      Foundations.Branch = MAIN,
    ): Promise<Record<string, Forge.JobSpec.Schema>> {
        const specs = await this.forge.jobSpecs.publish(principal, producerRid, branch, shapes.map((shape) => ({
            logic: Forge.JobSpec.Logic.parse({
                type:         'code-workspace',
                workspaceRid: 'ri.code-workspace.main.workspace.01a1729a-975b-70de-8141-89cca28b34d2',
                commit:       'a'.repeat(40),
                transform:    `pkg.${shape.name}.${shape.name}`,
            }),
            inputDatasetRids:  shape.inputs.map((name) => datasets[name]),
            outputDatasetRids: shape.outputs.map((name) => datasets[name]),
            resources:         { cpuCores: 1, memoryGb: 4 },
        })));

        return Object.fromEntries(shapes.map((shape, index) => [shape.name, specs[index]]));
    }

    /** A manual build of these datasets on main. */
    public async build(principal: Principal.User, datasetRids: Catalog.Dataset.Rid[]): Promise<Forge.API.CreateBuild.Response> {
        return this.forge.initializeBuild(principal, {
            branch:           MAIN,
            fallbackBranches: [],
            target:           { type: 'manual', datasetRids },
            forceBuild:       false,
            abortOnFailure:   false,
            retryCount:       0,
        });
    }

    /** Plays a ForgeAgent for one job: start, then finish with this outcome. */
    public async run(job: Forge.Job.Schema, status: 'succeeded' | 'failed' = 'succeeded'): Promise<void> {
        await this.agent.startJob(job.rid, job.attempt);
        await this.agent.finishJob(job.rid, {
            attempt: job.attempt,
            status,
            failure: status === 'failed' ? { message: 'test failure' } : null,
        });
    }

    /** The build's jobs now, by the name of the spec each runs. */
    public async jobsBySpec(
        principal: Principal.User,
        buildRid:  Forge.Build.Rid,
        specs:     Record<string, Forge.JobSpec.Schema>,
    ): Promise<{ build: Forge.Build.Schema; jobs: Record<string, Forge.Job.Schema> }> {
        const found = await this.forge.getBuild(principal, buildRid);
        const names = Object.fromEntries(Object.entries(specs).map(([name, spec]) => [spec.rid, name]));

        return {
            build: found.build,
            jobs:  Object.fromEntries(Object.values(found.jobs).map((job) => [names[job.jobSpecRid], job])),
        };
    }

    /** The statuses of the build's jobs, by spec name — the shape most assertions check. */
    public async statuses(
        principal: Principal.User,
        buildRid:  Forge.Build.Rid,
        specs:     Record<string, Forge.JobSpec.Schema>,
    ): Promise<Record<string, Forge.Job.Status>> {
        const { jobs } = await this.jobsBySpec(principal, buildRid, specs);

        return Object.fromEntries(Object.entries(jobs).map(([name, job]) => [name, job.status]));
    }

    /** Gives a member a role on a resource (and everything under it), as `granter`. */
    public async grant(granter: Principal.User, resourceRid: Library.Resource.Rid, member: Principal.User, role: Gatekeeper.Role.Name): Promise<void> {
        await this.gatekeeper.grant(granter, resourceRid, { type: 'user', userRid: member.userRid }, role);
    }

    /** Simulates a failure the code can't produce on demand: sets a job's status directly. */
    public async setStatus(jobRid: Forge.Job.Rid, status: Forge.Job.Status): Promise<void> {
        await sql`update forge.job set status = ${status} where rid = ${jobRid}`.execute(db());
    }

    /** Simulates a job queued `minutes` ago. */
    public async backdateQueued(jobRid: Forge.Job.Rid, minutes: number): Promise<void> {
        await sql`update forge.job set queued_at = now() - make_interval(mins => ${minutes}) where rid = ${jobRid}`.execute(db());
    }

    /** How many transactions are open on a dataset — the lock a build or upload holds. */
    public async openTransactions(datasetRid: Catalog.Dataset.Rid): Promise<number> {
        const { rows } = await sql<{ n: number }>`
            select count(*)::int as n from catalog.transaction where dataset_rid = ${datasetRid} and status = 'open'`.execute(db());

        return rows[0].n;
    }

    /** The status of a Catalog transaction (Forge can't read them; the test can). */
    public async transactionStatus(rid: Catalog.Transaction.Rid): Promise<string | undefined> {
        const { rows } = await sql<{ status: string }>`select status from catalog.transaction where rid = ${rid}`.execute(db());

        return rows[0]?.status;
    }

    private async _commitVersion(principal: Principal.User, datasetRid: Catalog.Dataset.Rid): Promise<void> {
        const transaction = await this.catalog.transaction.open(principal, datasetRid, 'snapshot');

        await this.catalog.transaction.registerChanges(principal, datasetRid, transaction.rid, [{
            op:          'add',
            logicalPath: 'part-0.parquet',
            format:      'parquet',
            key:         `${datasetRid}/${transaction.rid}/part-0.parquet`,
            bytes:       1,
            rowCount:    0,
        }]);

        await this.catalog.transaction.commit(principal, datasetRid, transaction.rid, null);
    }
}
