import { randomUUID } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import axios, { type AxiosInstance } from 'axios';
import { Queue } from 'bullmq';
import { SignJWT } from 'jose';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { Catalog, CodeWorkspace, Dataset, Forge, Foundations, type Gatekeeper, Identity, Library } from '@quarry/shared/domain';
import { QUEUE_PREFIX, redisConnection } from '@quarry/shared/server/redis';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { destroyPool, useDatabaseLogin } from '@quarry/platform-kernel/db/pool';
import { CatalogClient } from '@quarry/platform-kernel/microservice/clients';
import { DurableQueues } from '@quarry/platform-kernel/infra/durable-queue';
import { LibraryService } from '@quarry/platform-kernel/services/Library/library.service';
import { ForgeService } from '@quarry/forge-microservice/services/forge/forge.service';
import { JobService } from '@quarry/forge-microservice/services/job/job.service';
import { ForgeMicroserviceModule } from '@quarry/forge-microservice/microservice.module';

export const MAIN = Foundations.MAIN_BRANCH;

/** A recipe to publish, by dataset name: what it reads, what it writes. */
export interface RecipeShape {
    readonly name:    string;
    readonly inputs:  string[];
    readonly outputs: string[];
}

/** The workspace and commit a recipe's transform is taken from. */
export interface RecipeCode {
    readonly workspaceRid: CodeWorkspace.Rid;
    readonly commit:       CodeWorkspace.Git.Commit;
}

/** For tests whose jobs never run code (the test plays the agent). */
const MADE_UP_CODE: RecipeCode = {
    workspaceRid: CodeWorkspace.Rid.parse('ri.code-workspace.main.workspace.01a1729a-975b-70de-8141-89cca28b34d2'),
    commit:       CodeWorkspace.Git.Commit.parse('a'.repeat(40)),
};

/**
 * The Forge service's modules in one Nest context, **on its own database login**, against the test
 * database and Redis — with the main server and Catalog running as processes (test/support/global-setup.ts)
 * for its microservice calls, as in production — plus what Forge tests need around them. Users, projects
 * and grants are the platform's to write: the fixtures write them through the owner's connection;
 * datasets and their versions through Catalog's calls, as the user.
 */
export class ForgeHarness {

    public readonly forge:   ForgeService;
    public readonly jobs:    JobService;
    public readonly durableQueues: DurableQueues;
    /** Catalog, as Forge calls it — microservice calls, as the user or the service. */
    public readonly catalog: CatalogClient;
    public readonly library: LibraryService;

    /** The ForgeAgents' queue, to see what was pushed. */
    public readonly runJobQueue = new Queue(Forge.Queue.RunJob.Definition.name, { connection: redisConnection(), prefix: QUEUE_PREFIX });

    private constructor(
        private readonly app:   INestApplicationContext,
        private readonly owner: Kysely<unknown>,
    ) {
        this.forge = app.get(ForgeService);
        this.jobs = app.get(JobService);
        this.durableQueues = app.get(DurableQueues);
        this.catalog = app.get(CatalogClient);
        this.library = app.get(LibraryService);
    }

    /** Get the Nest context's other services. */
    public get<T>(type: new (...args: never[]) => T): T {
        return this.app.get(type);
    }

    public static async start(): Promise<ForgeHarness> {
        useDatabaseLogin({ url: requireEnv('FORGE_DATABASE_URL'), userRole: 'forge_user' });

        const owner = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: requireEnv('DATABASE_URL'), max: 2 }) }) });

        return new ForgeHarness(await NestFactory.createApplicationContext(ForgeMicroserviceModule, { logger: false }), owner);
    }

    public async stop(): Promise<void> {
        await this.runJobQueue.close();
        await this.app.close();
        await destroyPool();
        await this.owner.destroy();
    }

    /** The main server's or a service's HTTP API, as the user — with a token signed as GoTrue's are. */
    public async getApi(principal: Principal.User, baseURL = requireEnv('QUARRY_SERVER_URL')): Promise<AxiosInstance> {
        const token = await new SignJWT({})
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject(Foundations.Rid.parse(principal.userRid).locator)
            .setAudience('authenticated')
            .setExpirationTime('1h')
            .sign(new TextEncoder().encode(requireEnv('GOTRUE_JWT_SECRET')));

        return axios.create({ baseURL, headers: { authorization: `Bearer ${token}` } });
    }

    /** A workspace member (an admin by default: owner of everything), inserted directly. */
    public async createUser(workspaceRole: Identity.User.WorkspaceRole = 'admin'): Promise<Principal.User> {
        const userRid = Identity.User.fromAuthId(randomUUID());

        await sql`
            insert into identity."user" (rid, email, display_name, workspace_role)
            values (${userRid}, ${`${userRid}@test.quarry`}, 'Test user', ${workspaceRole})`.execute(this.owner);

        return { type: 'user', userRid, workspaceRole };
    }

    /**
     * A project with a dataset per name — the project the Library's, in the main server: the owner writes it
     * here. Datasets named in `withData` get one committed version (a one-row CSV, uploaded to Catalog), so
     * builds may use them as inputs.
     */
    public async createDatasets(
        principal: Principal.User,
        names:     string[],
        withData:  string[] = [],
    ): Promise<{ projectRid: Dataset['parentRid']; datasets: Record<string, Dataset.Rid> }> {
        const projectRid = Library.Project.createRid();
        const datasets: Record<string, Dataset.Rid> = {};

        await sql`
            insert into library.resource (rid, type, name, created_by)
            values (${projectRid}, 'project', ${`Test ${randomUUID()}`}, ${principal.userRid})`.execute(this.owner);

        for (const name of names) {
            const dataset = await this.catalog.createDataset(principal, { parentRid: projectRid, name, description: null });

            datasets[name] = dataset.rid;

            if (withData.includes(name))
                await this.commitVersion(principal, dataset.rid);
        }

        return { projectRid, datasets };
    }

    /**
     * Publishes the recipes, producer = the project (any library resource will do). Returns them by recipe name.
     * Recipe `A` runs transform `pkg.A.A` of `code` — a made-up workspace and commit unless a test gives a real one —
     * whose parameters are named after the datasets.
     */
    public async publish(
        principal:   Principal.User,
        producerRid: Dataset['parentRid'],
        datasets:    Record<string, Dataset.Rid>,
        shapes:      RecipeShape[],
        branch:      Foundations.Branch = MAIN,
        code:        RecipeCode = MADE_UP_CODE,
    ): Promise<Record<string, Forge.Recipe>> {
        const recipes = await this.forge.recipes.publish(principal, producerRid, branch, shapes.map((shape) => ({
            runtime: Forge.Recipe.Runtime.parse({
                type:         'code-workspace',
                workspaceRid: code.workspaceRid,
                commit:       code.commit,
                transform:    `pkg.${shape.name}.${shape.name}`,
                inputs:       Object.fromEntries(shape.inputs.map((name) => [name, datasets[name]])),
                outputs:      Object.fromEntries(shape.outputs.map((name) => [name, datasets[name]])),
            }),
            inputDatasetRids:  shape.inputs.map((name) => datasets[name]),
            outputDatasetRids: shape.outputs.map((name) => datasets[name]),
            compute:           { cpuCores: 1, memoryGb: 4 },
        })));

        return Object.fromEntries(shapes.map((shape, index) => [shape.name, recipes[index]]));
    }

    /** A manual build of these datasets on main — a failure cancelling its descendants, unless asked otherwise. */
    public async build(
        principal:    Principal.User,
        datasetRids:  Dataset.Rid[],
        onJobFailure: Forge.Build.OnJobFailure = 'cancel-descendants',
    ): Promise<Forge.API.CreateBuild.Response> {
        return this.forge.initializeBuild(principal, {
            branch:           MAIN,
            fallbackBranches: [],
            target:           { type: 'manual', datasetRids },
            forceBuild:       false,
            onJobFailure,
            retryCount:       0,
        });
    }

    /** Plays a ForgeAgent for one job: claim, then finish with this outcome. */
    public async run(job: Forge.Job, status: 'succeeded' | 'failed' = 'succeeded'): Promise<void> {
        await this.forge.claimJob(job.rid, job.attempt);
        await this.forge.finishJob(job.rid, {
            attempt: job.attempt,
            status,
            failure: status === 'failed' ? { message: 'test failure' } : null,
        });
    }

    /** The build's jobs now, by the name of the recipe each runs. */
    public async jobsByRecipe(
        principal: Principal.User,
        buildRid:  Forge.Build.Rid,
        recipes:     Record<string, Forge.Recipe>,
    ): Promise<{ build: Forge.Build; jobs: Record<string, Forge.Job> }> {
        const found = await this.forge.getBuild(principal, buildRid);
        const names = Object.fromEntries(Object.entries(recipes).map(([name, recipe]) => [recipe.rid, name]));

        return {
            build: found.build,
            jobs:  Object.fromEntries(Object.values(found.jobs).map((job) => [names[job.recipeRid], job])),
        };
    }

    /** The statuses of the build's jobs, by recipe name — the shape most assertions check. */
    public async statuses(
        principal: Principal.User,
        buildRid:  Forge.Build.Rid,
        recipes:     Record<string, Forge.Recipe>,
    ): Promise<Record<string, Forge.Job.Status>> {
        const { jobs } = await this.jobsByRecipe(principal, buildRid, recipes);

        return Object.fromEntries(Object.entries(jobs).map(([name, job]) => [name, job.status]));
    }

    /** Gives a member a role on a resource (and everything under it), as `granter` — granting is the main server's; the owner writes it here. */
    public async grant(granter: Principal.User, resourceRid: Library.Resource.Rid, member: Principal.User, role: Gatekeeper.Role.Name): Promise<void> {
        await sql`
            insert into gatekeeper.role_grant (resource_rid, user_rid, role, granted_by)
            values (${resourceRid}, ${member.userRid}, ${role}, ${granter.userRid})`.execute(this.owner);
    }

    /** Trashes a resource whatever its type — the Library app's, in the main server; the owner writes it here. */
    public async trash(principal: Principal.User, rid: Library.Resource.Rid): Promise<void> {
        await sql`update library.resource set trashed_at = now(), trashed_by = ${principal.userRid} where rid = ${rid}`.execute(this.owner);
    }

    /** A dataset's current version on main — Catalog's HTTP API, as the user. */
    public async view(principal: Principal.User, datasetRid: Dataset.Rid): Promise<Dataset.View> {
        const { view } = await Catalog.API.Dataset.getView(await this.getApi(principal, requireEnv('CATALOG_URL')), datasetRid);

        return view;
    }

    /** Simulates a failure the code can't produce on demand: sets a job's status directly. */
    public async setStatus(jobRid: Forge.Job.Rid, status: Forge.Job.Status): Promise<void> {
        await sql`update forge.job set status = ${status} where rid = ${jobRid}`.execute(this.owner);
    }

    /** A job attempt's run-job message in the outbox (null: acked, or never added) — what the sweep sends again until acked. */
    public async getOutboxMessage(job: Pick<Forge.Job, 'rid' | 'attempt'>): Promise<{ sentAt: Date | null; sends: number } | null> {
        const { rows } = await sql<{ sent_at: Date | null; sends: number }>`
            select sent_at, sends from foundations.outbox
             where queue_name = ${Forge.Queue.RunJob.Definition.name} and job_id = ${Forge.Queue.RunJob.getQueueJobId(Forge.Job.getQueueMessage(job))}`.execute(this.owner);

        return rows[0] ? { sentAt: rows[0].sent_at, sends: rows[0].sends } : null;
    }

    /** Simulates a job's message sent `minutes` ago and never acked. */
    public async backdateSent(job: Pick<Forge.Job, 'rid' | 'attempt'>, minutes: number): Promise<void> {
        await sql`
            update foundations.outbox set sent_at = now() - make_interval(mins => ${minutes})
             where queue_name = ${Forge.Queue.RunJob.Definition.name} and job_id = ${Forge.Queue.RunJob.getQueueJobId(Forge.Job.getQueueMessage(job))}`.execute(this.owner);
    }

    /** How many transactions are open on a dataset — the lock a build or upload holds. */
    public async openTransactions(datasetRid: Dataset.Rid): Promise<number> {
        const { rows } = await sql<{ n: number }>`
            select count(*)::int as n from catalog.transaction where dataset_rid = ${datasetRid} and status = 'open'`.execute(this.owner);

        return rows[0].n;
    }

    /** The status of a Catalog transaction (Forge can't read them; the test can). */
    public async transactionStatus(rid: Catalog.Transaction.Rid): Promise<string | undefined> {
        const { rows } = await sql<{ status: string }>`select status from catalog.transaction where rid = ${rid}`.execute(this.owner);

        return rows[0]?.status;
    }

    private async commitVersion(principal: Principal.User, datasetRid: Dataset.Rid): Promise<void> {
        await Catalog.API.Dataset.upload(await this.getApi(principal, requireEnv('CATALOG_URL')), datasetRid, { mode: 'snapshot' }, new Blob(['n\n1\n']), 'part-0.csv');
    }
}

function requireEnv(name: string): string {
    const value = process.env[name];

    if (!value)
        throw new Error(`${name} is not set — tests need test/support/env.ts`);

    return value;
}
