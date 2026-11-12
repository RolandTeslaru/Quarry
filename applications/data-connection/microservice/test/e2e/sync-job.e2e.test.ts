import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { ConflictException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import type { AxiosInstance } from 'axios';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Catalog, type DataConnection, type Dataset, Forge, Foundations } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { withDatabase } from '@quarry/platform-kernel/testing/test-env';
import { DataConnectionMicroserviceModule } from '@quarry/data-connection-microservice/microservice.module';
import { DataConnectionHarness, type PostgresLogin } from '../support/data-connection-fixtures';
import { createExternalDatabase, dropExternalDatabase } from '../support/external-database';

/** How long a ForgeAgent gets to boot (ts-node compiles it first) and a build to finish (a container per job). */
const AGENT_BOOT_MS = 60_000;
const BUILD_DONE_MS = 60_000;

/**
 * End to end, across processes: a sync as a Forge build. A real ForgeAgent takes the job and starts the
 * `quarry/data-connection-runtime:dev` image (`npm run build:data-connection-runtime`), which gets its credential
 * from this service, copies a real Postgres through DuckDB, and uploads through signed URLs. The source is a
 * throwaway database on the dev Postgres, reached from the container as the host.
 */
describe('a sync as a Forge build', () => {

    let server: NestExpressApplication;
    let agent: ChildProcess;
    let agentLog = '';
    let harness: DataConnectionHarness;
    let user: Principal.User;
    let forge: AxiosInstance;
    let login: PostgresLogin;

    const external = `quarry_test_sync_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

    beforeAll(async () => {
        const local = await createExternalDatabase(external);

        login = { ...local, host: 'host.docker.internal' };

        // The harness first: it sets this process's database login (Data Connection's) before any query.
        harness = await DataConnectionHarness.start();
        user = await harness.createUser();
        forge = await harness.getApi(user, process.env.FORGE_URL);

        // Where the main server forwards /api/data-connection: the job's runtime gets its credential through it.
        server = await NestFactory.create<NestExpressApplication>(DataConnectionMicroserviceModule, { logger: false });
        server.setGlobalPrefix('api');
        await server.listen(Number(new URL(process.env.DATA_CONNECTION_URL!).port), '127.0.0.1');

        agent = startAgent((chunk) => agentLog += chunk);
        await waitFor(() => agentLog.includes('ForgeAgent listening'), AGENT_BOOT_MS, () => `the agent didn't start:\n${agentLog}`);
    }, AGENT_BOOT_MS + 30_000);

    afterAll(async () => {
        agent?.kill('SIGTERM');
        await harness?.stop();
        await server?.close();
        await dropExternalDatabase(external);
    });

    /** Builds the sync's dataset, and waits for it to end. Forced, as a sync's run is: the source's new data is invisible to Forge. */
    async function build(sync: DataConnection.Sync): Promise<Forge.API.GetBuild.Response> {
        const { build: started } = await Forge.API.createBuild(forge, {
            branch:           Foundations.MAIN_BRANCH,
            fallbackBranches: [],
            target:           { type: 'manual', datasetRids: [sync.outputDatasetRid] },
            forceBuild:       true,
        });
        let found = await Forge.API.getBuild(forge, started.rid);

        await waitFor(async () => {
            found = await Forge.API.getBuild(forge, started.rid);

            return found.build.status !== 'running';
        }, BUILD_DONE_MS, () => `the build didn't finish:\n${agentLog}`);

        return found;
    }

    async function view(datasetRid: Dataset.Rid): Promise<Dataset.View> {
        const { view: current } = await Catalog.API.Dataset.getView(await harness.getApi(user, process.env.CATALOG_URL), datasetRid);

        return current;
    }

    async function insertTool(id: number, updatedAt: string): Promise<void> {
        const client = new Client({ connectionString: withDatabase(process.env.DATABASE_URL ?? '', external) });

        await client.connect();
        await client.query('INSERT INTO public.tools VALUES ($1, $2, $3)', [id, `tool ${id}`, updatedAt]);
        await client.end();
    }

    it('copies a table into its dataset: one job, one new version, with its schema', async () => {
        const { source } = await harness.createSource(user, login);
        const sync = await harness.createSync(user, source, { snapshot: true });

        const done = await build(sync);

        expect(done.build.status).toBe('succeeded');
        expect(Object.keys(done.jobs)).toHaveLength(1);
        expect(agentLog).toContain('Copied 3 rows');
        expect(await view(sync.outputDatasetRid)).toMatchObject({ sequence: 1, rowCount: 3 });
        expect((await view(sync.outputDatasetRid)).schema?.columns.map((column) => column.name)).toEqual(['id', 'name', 'updated_at']);
    });

    it('replaces the view on each run of a snapshot sync', async () => {
        const { source } = await harness.createSource(user, login);
        const sync = await harness.createSync(user, source, { snapshot: true });

        await build(sync);
        await build(sync);

        expect(await view(sync.outputDatasetRid)).toMatchObject({ sequence: 2, rowCount: 3 });
    });

    it('appends only what is new on each run of an incremental sync, and keeps its mark when nothing is', async () => {
        const { source } = await harness.createSource(user, login);
        const sync = await harness.createSync(user, source);

        await build(sync);
        expect(await view(sync.outputDatasetRid)).toMatchObject({ sequence: 1, rowCount: 3 });

        await build(sync);                                                  // nothing new
        expect(await view(sync.outputDatasetRid)).toMatchObject({ sequence: 2, rowCount: 3 });

        await insertTool(4, '2026-12-01');
        await build(sync);
        expect(await view(sync.outputDatasetRid)).toMatchObject({ sequence: 3, rowCount: 4 });
    });

    it("fails the job when it can't reach the source, naming why, and leaves the dataset alone", async () => {
        const { source } = await harness.createSource(user, { ...login, port: 1 });
        const sync = await harness.createSync(user, source);

        const done = await build(sync);
        const [job] = Object.values(done.jobs);

        expect(done.build.status).toBe('failed');
        expect(job.failure?.message).toMatch(/Unable to connect|connect/i);
        expect(job.failure?.message).not.toContain(login.password);
        expect(await view(sync.outputDatasetRid)).toMatchObject({ sequence: 0 });
    });

    it("refuses a finished job's token its source's credential", async () => {
        const { source } = await harness.createSource(user, login);
        const sync = await harness.createSync(user, source, { snapshot: true });
        const { jobs } = await build(sync);
        const [job] = Object.values(jobs);

        await expect(harness.dataConnection.getJobConnection({ ...user, via: 'forge-job' }, job.rid)).rejects.toBeInstanceOf(ConflictException);
    });
});

/** applications/forge/agent, pointed at the test Forge and test Redis; its job containers at the test main server. */
function startAgent(onOutput: (chunk: string) => void): ChildProcess {
    const child = spawn('npx', ['ts-node', '-r', 'tsconfig-paths/register', 'src/main.ts'], {
        cwd: path.resolve(__dirname, '../../../../forge/agent'),
        env: {
            ...process.env,
            FORGE_AGENT_JOB_SERVER_URL: `http://host.docker.internal:${new URL(process.env.QUARRY_SERVER_URL!).port}`,
            FORGE_AGENT_PORT:           '0',
            NO_COLOR:                   '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk: Buffer) => onOutput(chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => onOutput(chunk.toString()));

    return child;
}

/** Polls until the condition holds, or fails with `describe()` after `timeoutMs`. */
async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number, describe: () => string): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (!(await condition())) {
        if (Date.now() > deadline)
            throw new Error(describe());

        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}
