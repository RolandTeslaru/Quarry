import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { isAxiosError, type AxiosInstance } from 'axios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Catalog, CodeWorkspace, type Dataset, Forge } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { ForgeClient } from '@quarry/platform-kernel/microservice/clients';
import { CodeWorkspaceMicroserviceModule } from '@quarry/code-workspace-server/microservice.module';
import { CodeWorkspaceHarness, MAIN, createWorkspace } from '../support/code-workspace-fixtures';

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

/** A recipe to publish, by dataset name: what it reads, what it writes. */
interface RecipeShape {
    readonly name:    string;
    readonly inputs:  string[];
    readonly outputs: string[];
}

/**
 * End to end, across processes: the main server, Catalog and Forge (the global setup's), this service over
 * HTTP where the main server forwards Git to it, and a real ForgeAgent process (applications/forge/agent)
 * taking jobs from Redis and calling Forge's ForgeAgent API — its job containers clone through the main
 * server, and read and write through it. Nothing played by the test.
 */
describe('a real ForgeAgent', () => {

    let server: NestExpressApplication;
    let agent: ChildProcess;
    let agentLog = '';
    let harness: CodeWorkspaceHarness;
    let user: Principal.User;
    let forge: AxiosInstance;
    let code: { workspaceRid: CodeWorkspace.Rid; commit: CodeWorkspace.Git.Commit };

    beforeAll(async () => {
        server = await NestFactory.create<NestExpressApplication>(CodeWorkspaceMicroserviceModule, { logger: false });
        server.setGlobalPrefix('api');
        await server.listen(Number(new URL(process.env.CODE_WORKSPACE_URL!).port), '127.0.0.1');

        agent = startAgent((chunk) => agentLog += chunk);
        await waitFor(() => agentLog.includes('ForgeAgent listening'), AGENT_BOOT_MS, () => `the agent didn't start:\n${agentLog}`);

        harness = await CodeWorkspaceHarness.start();
        user = await harness.createUser();
        forge = await harness.getApi(user, process.env.FORGE_URL);

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
    });

    /** Publishes the recipes, producer = the project, as Forge's call. Recipe `A` runs transform `pkg.A.A` at the workspace's commit. */
    async function publish(projectRid: Dataset['parentRid'], datasets: Record<string, Dataset.Rid>, shapes: RecipeShape[]): Promise<Record<string, Forge.Recipe>> {
        const recipes: Forge.Microservice.PublishRecipes.Request["recipes"] = [];

        for (const shape of shapes) {
            const inputs: Record<string, Dataset.Rid> = {};
            const outputs: Record<string, Dataset.Rid> = {};

            for (const name of shape.inputs)
                inputs[name] = datasets[name];

            for (const name of shape.outputs)
                outputs[name] = datasets[name];

            recipes.push({
                runtime:           Forge.Recipe.Runtime.parse({ type: 'code-workspace', ...code, transform: `pkg.${shape.name}.${shape.name}`, inputs, outputs }),
                inputDatasetRids:  Object.values(inputs),
                outputDatasetRids: Object.values(outputs),
                compute:           { cpuCores: 1, memoryGb: 4 },
            });
        }

        const published = await harness.get(ForgeClient).publishRecipes(user, { producerRid: projectRid, branch: MAIN, recipes });
        const byName: Record<string, Forge.Recipe> = {};

        for (const [index, shape] of shapes.entries())
            byName[shape.name] = published[index];

        return byName;
    }

    /** The build's jobs now, by the name of the recipe each runs. */
    async function jobsByRecipe(buildRid: Forge.Build.Rid, recipes: Record<string, Forge.Recipe>): Promise<{ build: Forge.Build; jobs: Record<string, Forge.Job> }> {
        const found = await Forge.API.getBuild(forge, buildRid);
        const jobs: Record<string, Forge.Job> = {};

        for (const [name, recipe] of Object.entries(recipes))
            for (const job of Object.values(found.jobs))
                if (job.recipeRid === recipe.rid)
                    jobs[name] = job;

        return { build: found.build, jobs };
    }

    async function finished(buildRid: Forge.Build.Rid): Promise<Forge.API.GetBuild.Response> {
        let found = await Forge.API.getBuild(forge, buildRid);

        await waitFor(async () => {
            found = await Forge.API.getBuild(forge, buildRid);

            return found.build.status !== 'running';
        }, BUILD_DONE_MS, () => `the build didn't finish:\n${agentLog}`);

        return found;
    }

    it('runs a one-job build to the end', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a'], ['raw']);

        await publish(projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);

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

        await Catalog.API.Dataset.upload(await harness.getApi(user, process.env.CATALOG_URL), datasets.raw, { mode: 'snapshot' },
            new Blob(['id,amount\n1,10\n2,20\n3,30\n']), 'orders.csv');
        await publish(projectRid, datasets, [{ name: 'R', inputs: ['raw'], outputs: ['r'] }]);

        const { build } = await harness.build(user, [datasets.r]);
        const done = await finished(build.rid);

        expect(done.build.status).toBe('succeeded');
        expect(agentLog).toContain('rows 3');
    });

    it("writes its outputs as new versions, which the next job in the build reads", async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'w', 'x'], []);

        await Catalog.API.Dataset.upload(await harness.getApi(user, process.env.CATALOG_URL), datasets.raw, { mode: 'snapshot' },
            new Blob(['id,amount\n1,10\n2,20\n3,30\n']), 'orders.csv');
        await publish(projectRid, datasets, [
            { name: 'W', inputs: ['raw'], outputs: ['w'] },
            { name: 'X', inputs: ['w'],   outputs: ['x'] },
        ]);

        const { build } = await harness.build(user, [datasets.w, datasets.x]);
        const done = await finished(build.rid);

        expect(done.build.status).toBe('succeeded');
        expect(agentLog).toContain('x read 2 rows written by W');            // W kept amount > 10: 2 of 3

        const w = await harness.view(user, datasets.w);
        const x = await harness.view(user, datasets.x);

        expect(w).toMatchObject({ sequence: 1, rowCount: 2 });
        expect(x).toMatchObject({ sequence: 1, rowCount: 2 });
        expect(w.schema?.columns.map((column) => column.name)).toEqual(['id', 'amount']);
    });

    it("fails the job when the commit doesn't have its transform", async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'e'], ['raw']);

        await publish(projectRid, datasets, [{ name: 'E', inputs: ['raw'], outputs: ['e'] }]);

        const { build } = await harness.build(user, [datasets.e]);
        const done = await finished(build.rid);
        const [job] = Object.values(done.jobs);

        expect(done.build.status).toBe('failed');
        expect(job.failure?.message).toBe('Run the transform failed with exit code 1');
        expect(agentLog).toContain('No transform named pkg.E.E at this commit');
    });

    it('runs a diamond in dependency order', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b', 'c', 'd'], ['raw']);
        const recipes = await publish(projectRid, datasets, [
            { name: 'A', inputs: ['raw'],    outputs: ['a'] },
            { name: 'B', inputs: ['a'],      outputs: ['b'] },
            { name: 'C', inputs: ['a'],      outputs: ['c'] },
            { name: 'D', inputs: ['b', 'c'], outputs: ['d'] },
        ]);

        const { build } = await harness.build(user, [datasets.a, datasets.b, datasets.c, datasets.d]);

        await finished(build.rid);

        const { build: after, jobs } = await jobsByRecipe(build.rid, recipes);
        const startedAt = (name: string) => jobs[name].startedAt?.getTime() ?? Infinity;
        const finishedAt = (name: string) => jobs[name].finishedAt?.getTime() ?? Infinity;

        expect(after.status).toBe('succeeded');
        expect(startedAt('B')).toBeGreaterThanOrEqual(finishedAt('A'));
        expect(startedAt('C')).toBeGreaterThanOrEqual(finishedAt('A'));
        expect(startedAt('D')).toBeGreaterThanOrEqual(Math.max(finishedAt('B'), finishedAt('C')));
    });

    it('cancels cleanly against a running agent — or loses the race to a build that finished first', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'f'], ['raw']);
        const recipes = await publish(projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'F', inputs: ['raw'], outputs: ['f'] },
        ]);

        const { build } = await harness.build(user, [datasets.a, datasets.f]);
        const outcome = await Forge.API.cancelBuild(forge, build.rid).then(() => 'canceled', (error: unknown) => getRefusal(error).message);

        // Give the agent time to try to finish whatever it had claimed.
        await new Promise((resolve) => setTimeout(resolve, 1_000));

        const { build: after, jobs } = await jobsByRecipe(build.rid, recipes);

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

        await publish(projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);

        // Built without the agent's help: claim it as an agent would, cancel, then try to finish.
        const { build, jobs } = await harness.build(user, [datasets.a]);
        const [job] = Object.values(jobs);

        await harness.claimJob(job).catch(() => undefined);        // the real agent may have taken it first
        await Forge.API.cancelBuild(forge, build.rid).catch(() => undefined);

        const refusal = await Forge.API.Agent.finish(harness.getAgentApi(), job.rid, { attempt: 1, status: 'succeeded', failure: null }).then(
            () => null,
            (error: unknown) => getRefusal(error),
        );
        const { job: after } = await Forge.API.getJob(forge, job.rid);

        if (after.status === 'canceled')
            expect(refusal).toMatchObject({ message: expect.stringMatching(/isn't running/) });
    });
});

/** applications/forge/agent, as `npm run dev:forge-agent` runs it, pointed at the test Forge and test Redis; its job containers at the test main server. */
function startAgent(onOutput: (chunk: string) => void): ChildProcess {
    const cwd = path.resolve(__dirname, '../../../../forge/agent');

    const child = spawn('npx', ['ts-node', '-r', 'tsconfig-paths/register', 'src/main.ts'], {
        cwd,
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

/** A refusal over HTTP, as the service said it: its message. */
function getRefusal(error: unknown): { message: string } {
    if (isAxiosError<{ message?: string }>(error) && error.response?.data?.message)
        return { message: error.response.data.message };

    throw error;
}
