import { spawn, type ChildProcess } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Forge } from '@quarry/shared/domain';
import { ApiModule } from '@/api.module';
import type { Principal } from '@/auth/principal';
import { destroyPool } from '@/db/pool';
import { ForgeHarness } from '../support/forge-fixtures';

/** How long a ForgeAgent gets to boot (ts-node compiles it first) and to finish a build. */
const AGENT_BOOT_MS = 60_000;
const BUILD_DONE_MS = 30_000;

/**
 * End to end, across processes: the server over HTTP on a random port (the
 * test database), and a real ForgeAgent process (packages/forge-agent) taking
 * jobs from Redis and calling the ForgeAgent API — nothing played by the test.
 */
describe('a real ForgeAgent', () => {

    let server: NestExpressApplication;
    let agent: ChildProcess;
    let agentLog = '';
    let harness: ForgeHarness;
    let user: Principal.User;

    beforeAll(async () => {
        server = await NestFactory.create<NestExpressApplication>(ApiModule, { logger: false });
        server.setGlobalPrefix('api');
        server.useWebSocketAdapter(new WsAdapter(server));
        await server.listen(0, '127.0.0.1');

        const { port } = server.getHttpServer().address() as AddressInfo;

        agent = startAgent(`http://127.0.0.1:${port}`, (chunk) => agentLog += chunk);
        await waitFor(() => agentLog.includes('ForgeAgent listening'), AGENT_BOOT_MS, () => `the agent didn't start:\n${agentLog}`);

        harness = await ForgeHarness.start();
        user = await harness.createUser();
    }, AGENT_BOOT_MS + 30_000);

    afterAll(async () => {
        agent?.kill('SIGTERM');
        await harness?.stop();
        await server?.close();
        await destroyPool();
    });

    async function finished(buildRid: Forge.Build.Rid): Promise<Forge.API.GetBuild.Response> {
        let found = await harness.forge.getBuild(user, buildRid);

        await waitFor(async () => {
            found = await harness.forge.getBuild(user, buildRid);

            return found.build.status !== 'running';
        }, BUILD_DONE_MS, () => `the build didn't finish:\n${agentLog}`);

        return found;
    }

    it('runs a one-job build to the end', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'out'], ['raw']);

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['out'] }]);

        const { build } = await harness.build(user, [datasets.out]);
        const done = await finished(build.rid);
        const [job] = Object.values(done.jobs);

        expect(done.build.status).toBe('succeeded');
        expect(job.status).toBe('succeeded');
        expect(job.startedAt).not.toBeNull();
        expect(agentLog).toContain(`Picked up ${job.rid}`);
    });

    it('runs a diamond in dependency order', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b', 'c', 'd'], ['raw']);
        const recipes = await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'],    outputs: ['a'] },
            { name: 'B', inputs: ['a'],      outputs: ['b'] },
            { name: 'C', inputs: ['a'],      outputs: ['c'] },
            { name: 'D', inputs: ['b', 'c'], outputs: ['d'] },
        ]);

        const { build } = await harness.build(user, [datasets.a, datasets.b, datasets.c, datasets.d]);

        await finished(build.rid);

        const { build: after, jobs } = await harness.jobsByRecipe(user, build.rid, recipes);
        const startedAt = (name: string) => jobs[name].startedAt?.getTime() ?? Infinity;
        const finishedAt = (name: string) => jobs[name].finishedAt?.getTime() ?? Infinity;

        expect(after.status).toBe('succeeded');
        expect(startedAt('B')).toBeGreaterThanOrEqual(finishedAt('A'));
        expect(startedAt('C')).toBeGreaterThanOrEqual(finishedAt('A'));
        expect(startedAt('D')).toBeGreaterThanOrEqual(Math.max(finishedAt('B'), finishedAt('C')));
    });

    it('cancels cleanly against a running agent — or loses the race to a build that finished first', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b'], ['raw']);
        const recipes = await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['raw'], outputs: ['b'] },
        ]);

        const { build } = await harness.build(user, [datasets.a, datasets.b]);
        const outcome = await harness.forge.cancelBuild(user, build.rid).then(() => 'canceled', (error: Error) => error.message);

        // Give the agent time to try to finish whatever it had claimed.
        await new Promise((resolve) => setTimeout(resolve, 1_000));

        const { build: after, jobs } = await harness.jobsByRecipe(user, build.rid, recipes);

        if (outcome === 'canceled') {
            // Canceled jobs stay canceled: a late finish is refused, so none turned succeeded afterwards.
            expect(after.status).toBe('canceled');
            expect(Object.values(jobs).every((job) => job.status === 'canceled' || (job.status === 'succeeded' && job.finishedAt))).toBe(true);
            expect(Object.values(jobs).some((job) => job.status === 'running')).toBe(false);
        }
        else {
            expect(outcome).toMatch(/finished meanwhile|Build is succeeded/);
            expect(after.status).toBe('succeeded');
        }

        for (const job of Object.values(jobs))
            for (const transactionRid of Object.values(job.outputs))
                expect(await harness.transactionStatus(transactionRid)).toBe('aborted');
    });

    it('drops the outcome of a job canceled while it ran (the agent gets 409 on finish)', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a'], ['raw']);

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);

        // Built without the agent's help: claim it as an agent would, cancel, then try to finish.
        const { build, jobs } = await harness.build(user, [datasets.a]);
        const [job] = Object.values(jobs);

        await harness.agent.claimJob(job.rid, 1).catch(() => undefined);        // the real agent may have taken it first
        await harness.forge.cancelBuild(user, build.rid).catch(() => undefined);

        const late = harness.agent.finishJob(job.rid, { attempt: 1, status: 'succeeded', failure: null });
        const after = await harness.forge.getJob(user, job.rid);

        if (after.status === 'canceled')
            await expect(late).rejects.toThrow(/isn't running/);
    });
});

/** packages/forge-agent, as `npm run dev:forge-agent` runs it, pointed at the test server and test Redis. */
function startAgent(serverUrl: string, onOutput: (chunk: string) => void): ChildProcess {
    const cwd = path.resolve(__dirname, '../../../forge-agent');

    const child = spawn('npx', ['ts-node', '-r', 'tsconfig-paths/register', 'src/main.ts'], {
        cwd,
        env: {
            ...process.env,
            QUARRY_SERVER_URL: serverUrl,
            FORGE_AGENT_PORT:  '0',
            NO_COLOR:          '1',
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
