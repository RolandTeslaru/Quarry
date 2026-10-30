import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CodeWorkspace, Dataset, Library } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import { CIService } from '@/services/CodeWorkspace/ci/ci.service';
import { MAIN, QUARRY_CI, commitFiles, createWorkspace } from '../support/code-workspace-fixtures';
import { ForgeHarness } from '../support/forge-fixtures';

import CI = CodeWorkspace.CI;
import CheckRun = CI.CheckRun;
import Outcome = CI.API.Internal.CheckRun.Finish.Request;

type Transform = CI.Check.Manifest.Transform;

/**
 * A passing check run publishes (docs/design/code-workspaces/checks.md §5): its
 * manifest, checked as the pusher, becomes the branch's recipes — pinned to the
 * commit — and those are what a build runs. Any refusal fails the run at its
 * publish step, naming what's wrong, and publishes nothing.
 */
describe('publishing recipes', () => {

    let harness: ForgeHarness;
    let checks: CIService;
    let admin: Principal.User;

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        checks = harness.get(CIService);
        admin = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function getPath(rid: Library.Resource.Rid): Promise<string> {
        return Library.Resource.getPath(await harness.library.path(admin, rid));
    }

    function transform(name: string, inputs: Record<string, string>, outputs: Record<string, string>): Transform {
        return { name: CodeWorkspace.ModuleFunctionPath.Schema.parse(name), inputs, outputs, resources: { cpuCores: 1, memoryGb: 4 } };
    }

    /** A workspace's check run, pushed and started by `pusher`: ready for the worker's finish. */
    async function startedRun(pusher: Principal.User = admin) {
        const workspace = await createWorkspace(harness, admin, { 'quarry-ci.yml': QUARRY_CI });

        if (pusher !== admin)
            await harness.grant(admin, workspace.projectRid, pusher, 'editor');

        const { queued } = await checks.queueChecksForMovedHeads(pusher, workspace.rid, workspace.heads);

        await checks.start(queued[0].rid);

        return { workspace, run: queued[0] };
    }

    async function finishWith(run: CheckRun.Schema, transforms: Transform[]): Promise<CheckRun.Schema> {
        return checks.finish(run.rid, Outcome.parse({ status: 'succeeded', manifest: { transforms } }));
    }

    it('publishes a recipe per transform, pinned to the commit, by path', async () => {
        const { datasets } = await harness.createDatasets(admin, ['raw', 'clean'], ['raw']);
        const { workspace, run } = await startedRun();

        const finished = await finishWith(run, [
            transform('sales.datasets.orders.clean', { raw: await getPath(datasets.raw) }, { out: await getPath(datasets.clean) }),
        ]);

        expect(finished).toMatchObject({ status: 'succeeded', published: true, failure: null });
        expect(finished.steps.at(-1)).toMatchObject({ name: CheckRun.PUBLISH_STEP, status: 'succeeded' });
        expect(finished.steps.at(-1)!.log).toMatch(/Published 1 recipe/);

        const recipe = await harness.forge.recipes.getCurrent(admin, datasets.clean, [MAIN]);

        expect(recipe).toMatchObject({
            producerRid:       workspace.rid,
            branch:            MAIN,
            runtime:           {
                type:         'code-workspace',
                workspaceRid: workspace.rid,
                commit:       run.commit,
                transform:    'sales.datasets.orders.clean',
                inputs:       { raw: datasets.raw },               // by parameter, as the code names them
                outputs:      { out: datasets.clean },
            },
            inputDatasetRids:  [datasets.raw],
            outputDatasetRids: [datasets.clean],
            compute:           { cpuCores: 1, memoryGb: 4 },
            publishedBy:       admin.userRid,
        });
    });

    it('takes dataset RIDs as references too', async () => {
        const { datasets } = await harness.createDatasets(admin, ['raw', 'clean'], ['raw']);
        const { run } = await startedRun();

        const finished = await finishWith(run, [transform('pkg.a.a', { raw: datasets.raw }, { out: datasets.clean })]);

        expect(finished.published).toBe(true);
        expect((await harness.forge.recipes.getCurrent(admin, datasets.clean, [MAIN]))?.inputDatasetRids).toEqual([datasets.raw]);
    });

    it("creates an output dataset that doesn't exist yet, in its folder", async () => {
        const { projectRid, datasets } = await harness.createDatasets(admin, ['raw'], ['raw']);
        const projectPath = await getPath(projectRid);
        const { run } = await startedRun();

        const finished = await finishWith(run, [transform('pkg.a.a', { raw: datasets.raw }, { out: `${projectPath}/brand new` })]);

        expect(finished.published).toBe(true);

        const created = await harness.library.getByPath(admin, `${projectPath}/brand new`);

        expect(created.type).toBe('dataset');
        expect(await harness.forge.recipes.getCurrent(admin, created.rid as Dataset.Rid, [MAIN])).not.toBeNull();
    });

    it('builds what it published: the job runs the commit\'s transform', async () => {
        const { datasets } = await harness.createDatasets(admin, ['raw', 'clean'], ['raw']);
        const { run } = await startedRun();

        await finishWith(run, [transform('pkg.a.clean', { raw: datasets.raw }, { out: datasets.clean })]);

        const { jobs } = await harness.build(admin, [datasets.clean]);
        const [job] = Object.values(jobs);
        const claimed = await harness.agent.claimJob(job.rid, 1);

        expect(claimed.recipe.runtime).toEqual({
            type:         'code-workspace',
            workspaceRid: run.workspaceRid,
            commit:       run.commit,
            transform:    'pkg.a.clean',
            inputs:       { raw: datasets.raw },
            outputs:      { out: datasets.clean },
        });
    });

    describe('refusals — the run fails at its publish step, nothing published', () => {

        async function expectRefused(run: CheckRun.Schema, transforms: Transform[], message: RegExp): Promise<void> {
            const finished = await finishWith(run, transforms);

            expect(finished).toMatchObject({ status: 'failed', published: false, failure: { step: CheckRun.PUBLISH_STEP } });
            expect(finished.failure!.message).toMatch(message);
            expect(finished.steps.at(-1)).toMatchObject({ status: 'failed' });
        }

        it("an input that isn't there", async () => {
            const { datasets } = await harness.createDatasets(admin, ['clean']);
            const { run } = await startedRun();

            await expectRefused(run, [transform('pkg.a.a', { raw: '/Nowhere/raw' }, { out: datasets.clean })], /Not found/);
            expect(await harness.forge.recipes.getCurrent(admin, datasets.clean, [MAIN])).toBeNull();
        });

        it('an output in a folder that doesn\'t exist', async () => {
            const { projectRid, datasets } = await harness.createDatasets(admin, ['raw'], ['raw']);
            const { run } = await startedRun();

            await expectRefused(run, [transform('pkg.a.a', { raw: datasets.raw }, { out: `${await getPath(projectRid)}/missing/out` })], /Not found/);
        });

        it("an output that's a project, not a dataset", async () => {
            const { projectRid, datasets } = await harness.createDatasets(admin, ['raw'], ['raw']);
            const { run } = await startedRun();

            await expectRefused(run, [transform('pkg.a.a', { raw: datasets.raw }, { out: await getPath(projectRid) })], /Not a catalog dataset RID/);
        });

        it('an output another workspace produces', async () => {
            const { datasets } = await harness.createDatasets(admin, ['raw', 'clean'], ['raw']);
            const first = await startedRun();

            await finishWith(first.run, [transform('pkg.a.a', { raw: datasets.raw }, { out: datasets.clean })]);

            const second = await startedRun();

            await expectRefused(second.run, [transform('pkg.b.b', { raw: datasets.raw }, { out: datasets.clean })], /already produced by/);
            expect((await harness.forge.recipes.getCurrent(admin, datasets.clean, [MAIN]))?.producerRid).toBe(first.workspace.rid);
        });

    });

    it("drops a removed transform's recipe on the next publish", async () => {
        const { datasets } = await harness.createDatasets(admin, ['raw', 'a', 'b'], ['raw']);
        const { workspace, run } = await startedRun();

        await finishWith(run, [
            transform('pkg.a.a', { raw: datasets.raw }, { out: datasets.a }),
            transform('pkg.b.b', { raw: datasets.raw }, { out: datasets.b }),
        ]);

        const next = await commitFiles(harness, workspace.rid, { 'remove-b.py': '' });
        const { queued } = await checks.queueChecksForMovedHeads(admin, workspace.rid, { [MAIN]: next });

        await checks.start(queued[0].rid);
        await finishWith(queued[0], [transform('pkg.a.a', { raw: datasets.raw }, { out: datasets.a })]);

        expect((await harness.forge.recipes.getCurrent(admin, datasets.a, [MAIN]))?.runtime).toMatchObject({ commit: next });
        expect(await harness.forge.recipes.getCurrent(admin, datasets.b, [MAIN])).toBeNull();
    });
});
