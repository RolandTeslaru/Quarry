import { spawn, type ChildProcess } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Forge } from '@quarry/shared/domain';
import { ApiModule } from '@/api.module';
import type { Principal } from '@/auth/principal';
import { destroyPool } from '@/db/pool';
import { createWorkspace } from '../support/code-workspace-fixtures';
import { ForgeHarness, MAIN, type RecipeCode } from '../support/forge-fixtures';

/** How long a ForgeAgent gets to boot (ts-node compiles it first) and to finish a build (a container per job). */
const AGENT_BOOT_MS = 60_000;
const BUILD_DONE_MS = 60_000;

/**
 * The transform behind the harness's recipe `A` — `pkg.A.A` — its parameters named after the datasets it
 * reads and writes, as the harness's recipes map them. Unless told otherwise, it writes one row to each output
 * without reading its inputs (the harness's versions have no real files).
 */
function transformFile(name: string, inputs: string[], outputs: string[], lines?: string[]): string {
    const parameters = [...inputs, ...outputs];
    const body = lines ?? outputs.map((output) => `${output}.write_table(pl.DataFrame({"n": [1]}))`);
    const declared = [
        ...inputs.map((input) => `${input}=Input("/Test/${input}")`),
        ...outputs.map((output) => `${output}=Output("/Test/${output}")`),
    ];

    return `import polars as pl
from quarry.transforms import Input, Output, transform


@transform.using(${declared.join(', ')})
def ${name}(${parameters.join(', ')}):
    ${body.join('\n    ')}
`;
}

/**
 * A workspace whose commit defines the transforms the tests build: a diamond (A → B, C → D), F beside A,
 * R, which reads its input, and a chain W → X that reads real data. No dependencies, so its lock is this short.
 */
const WORKSPACE_FILES = {
    'pyproject.toml': `[project]
name = "pkg"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = []

[tool.uv]
package = false
`,
    'uv.lock': `version = 1
revision = 3
requires-python = ">=3.12"

[[package]]
name = "pkg"
version = "0.1.0"
source = { virtual = "." }
`,
    'src/pkg/__init__.py': '',
    'src/pkg/pipeline.py': `from quarry.transforms import Pipeline

from pkg.A import A
from pkg.B import B
from pkg.C import C
from pkg.D import D
from pkg.F import F
from pkg.R import R
from pkg.W import W
from pkg.X import X

pipeline = Pipeline()
pipeline.add_transforms(A, B, C, D, F, R, W, X)
`,
    'src/pkg/A.py': transformFile('A', ['raw'], ['a']),
    'src/pkg/B.py': transformFile('B', ['a'], ['b']),
    'src/pkg/C.py': transformFile('C', ['a'], ['c']),
    'src/pkg/D.py': transformFile('D', ['b', 'c'], ['d']),
    'src/pkg/F.py': transformFile('F', ['raw'], ['f']),
    'src/pkg/R.py': transformFile('R', ['raw'], ['r'], [
        'print(f"rows {raw.polars(lazy=True).select(pl.len()).collect().item()}")',
        'r.write_table(pl.DataFrame({"n": [1]}))',
    ]),
    'src/pkg/W.py': transformFile('W', ['raw'], ['w'], [
        'w.write_table(raw.polars(lazy=True).filter(pl.col("amount") > 10))',
    ]),
    'src/pkg/X.py': transformFile('X', ['w'], ['x'], [
        'print(f"x read {w.polars().height} rows written by W")',
        'x.write_table(w.polars(lazy=True))',
    ]),
};

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
    let code: RecipeCode;

    beforeAll(async () => {
        server = await NestFactory.create<NestExpressApplication>(ApiModule, { logger: false });
        server.setGlobalPrefix('api');
        server.useWebSocketAdapter(new WsAdapter(server));
        await server.listen(0, '127.0.0.1');

        const { port } = server.getHttpServer().address() as AddressInfo;

        agent = startAgent(port, (chunk) => agentLog += chunk);
        await waitFor(() => agentLog.includes('ForgeAgent listening'), AGENT_BOOT_MS, () => `the agent didn't start:\n${agentLog}`);

        harness = await ForgeHarness.start();
        user = await harness.createUser();

        const workspace = await createWorkspace(harness, user, WORKSPACE_FILES);

        code = {
            workspaceRid: workspace.rid,
            commit:       workspace.heads[MAIN],
        };
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
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a'], ['raw']);

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }], MAIN, code);

        const { build } = await harness.build(user, [datasets.a]);
        const done = await finished(build.rid);
        const [job] = Object.values(done.jobs);

        expect(done.build.status).toBe('succeeded');
        expect(job.status).toBe('succeeded');
        expect(job.startedAt).not.toBeNull();
        expect(agentLog).toContain(`Picked up ${job.rid}`);
        expect(agentLog).toContain('Ran pkg.A.A');                  // cloned, installed, found and called at the commit
    });

    it('reads its input from storage, through read passes', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'r'], []);

        await harness.catalog.storage.upload(user, datasets.raw, 'snapshot', {
            filename: 'orders.csv',
            stream:   Readable.from(['id,amount\n1,10\n2,20\n3,30\n']),
        });
        await harness.publish(user, projectRid, datasets, [{ name: 'R', inputs: ['raw'], outputs: ['r'] }], MAIN, code);

        const { build } = await harness.build(user, [datasets.r]);
        const done = await finished(build.rid);

        expect(done.build.status).toBe('succeeded');
        expect(agentLog).toContain('rows 3');
    });

    it("writes its outputs as new versions, which the next job in the build reads", async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'w', 'x'], []);

        await harness.catalog.storage.upload(user, datasets.raw, 'snapshot', {
            filename: 'orders.csv',
            stream:   Readable.from(['id,amount\n1,10\n2,20\n3,30\n']),
        });
        await harness.publish(user, projectRid, datasets, [
            { name: 'W', inputs: ['raw'], outputs: ['w'] },
            { name: 'X', inputs: ['w'],   outputs: ['x'] },
        ], MAIN, code);

        const { build } = await harness.build(user, [datasets.w, datasets.x]);
        const done = await finished(build.rid);

        expect(done.build.status).toBe('succeeded');
        expect(agentLog).toContain('x read 2 rows written by W');            // W kept amount > 10: 2 of 3

        const w = await harness.catalog.view(user, datasets.w);
        const x = await harness.catalog.view(user, datasets.x);

        expect(w).toMatchObject({ sequence: 1, rowCount: 2 });
        expect(x).toMatchObject({ sequence: 1, rowCount: 2 });
        expect(w.schema?.columns.map((column) => column.name)).toEqual(['id', 'amount']);
    });

    it("fails the job when the commit doesn't have its transform", async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'e'], ['raw']);

        await harness.publish(user, projectRid, datasets, [{ name: 'E', inputs: ['raw'], outputs: ['e'] }], MAIN, code);

        const { build } = await harness.build(user, [datasets.e]);
        const done = await finished(build.rid);
        const [job] = Object.values(done.jobs);

        expect(done.build.status).toBe('failed');
        expect(job.failure?.message).toBe('Run the transform failed with exit code 1');
        expect(agentLog).toContain('No transform named pkg.E.E at this commit');
    });

    it('runs a diamond in dependency order', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b', 'c', 'd'], ['raw']);
        const recipes = await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'],    outputs: ['a'] },
            { name: 'B', inputs: ['a'],      outputs: ['b'] },
            { name: 'C', inputs: ['a'],      outputs: ['c'] },
            { name: 'D', inputs: ['b', 'c'], outputs: ['d'] },
        ], MAIN, code);

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
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'f'], ['raw']);
        const recipes = await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'F', inputs: ['raw'], outputs: ['f'] },
        ], MAIN, code);

        const { build } = await harness.build(user, [datasets.a, datasets.f]);
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

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }], MAIN, code);

        // Built without the agent's help: claim it as an agent would, cancel, then try to finish.
        const { build, jobs } = await harness.build(user, [datasets.a]);
        const [job] = Object.values(jobs);

        await harness.agent.claimJob(job.rid, 1).catch(() => undefined);        // the real agent may have taken it first
        await harness.forge.cancelBuild(user, build.rid).catch(() => undefined);

        const refusal = await harness.agent.finishJob(job.rid, { attempt: 1, status: 'succeeded', failure: null }).then(
            () => null,
            (error: unknown) => error,
        );
        const after = await harness.forge.getJob(user, job.rid);

        if (after.status === 'canceled')
            expect(refusal).toMatchObject({ message: expect.stringMatching(/isn't running/) });
    });
});

/** packages/forge-agent, as `npm run dev:forge-agent` runs it, pointed at the test server and test Redis. */
function startAgent(port: number, onOutput: (chunk: string) => void): ChildProcess {
    const cwd = path.resolve(__dirname, '../../../forge-agent');

    const child = spawn('npx', ['ts-node', '-r', 'tsconfig-paths/register', 'src/main.ts'], {
        cwd,
        env: {
            ...process.env,
            QUARRY_SERVER_URL:          `http://127.0.0.1:${port}`,
            FORGE_AGENT_JOB_SERVER_URL: `http://host.docker.internal:${port}`,
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
