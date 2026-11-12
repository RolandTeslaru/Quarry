import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CodeWorkspace, type Dataset, type Forge, type Library } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { ForgeHarness, MAIN } from '../support/forge-fixtures';

const NEW_CODE = {
    workspaceRid: CodeWorkspace.Rid.parse('ri.code-workspace.main.workspace.01a1729a-975b-70de-8141-89cca28b34d2'),
    commit:       CodeWorkspace.Git.Commit.parse('c'.repeat(40)),
};

/**
 * Whether datasets are what their recipes would compute now: each one's own reasons, against its
 * recipe and its parents' newest versions, and how far up its nearest stale dataset is.
 */
describe('staleness', () => {

    let harness: ForgeHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function getStaleness(datasetRids: Dataset.Rid[]): Promise<Record<Dataset.Rid, Library.Lineage.Staleness>> {
        return harness.forge.staleness.get(user, datasetRids, [MAIN]);
    }

    /** Builds the datasets and everything above them, playing the agent for each job until the build ends. */
    async function buildAll(datasetRids: Dataset.Rid[]): Promise<void> {
        const { build } = await harness.buildTarget(user, { type: 'upstream', datasetRids });
        let current = await harness.forge.getBuild(user, build.rid);

        while (current.build.status === 'running') {
            for (const job of Object.values(current.jobs))
                if (job.status === 'scheduled')
                    await harness.run(job);

            current = await harness.forge.getBuild(user, build.rid);
        }
    }

    it('a dataset nothing builds is fresh; one its recipe never built is never-built', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b'], ['raw']);

        await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['a'],   outputs: ['b'] },
        ]);

        expect(await getStaleness([datasets.raw, datasets.a, datasets.b])).toEqual({
            [datasets.raw]: { reasons: [],              changedInputs: [], distance: null },
            [datasets.a]:   { reasons: ['never-built'], changedInputs: [], distance: 0 },
            [datasets.b]:   { reasons: ['never-built'], changedInputs: [], distance: 0 },
        });
    });

    it('built from its parents\' newest versions with its recipe: fresh', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b'], ['raw']);
        await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['a'],   outputs: ['b'] },
        ]);

        await buildAll([datasets.b]);

        expect(await getStaleness([datasets.a, datasets.b])).toEqual({
            [datasets.a]: { reasons: [], changedInputs: [], distance: null },
            [datasets.b]: { reasons: [], changedInputs: [], distance: null },
        });
    });

    it('new data above: inputs-changed, naming the input — and its child out of date one step down', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b'], ['raw']);
        await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['a'],   outputs: ['b'] },
        ]);

        await buildAll([datasets.b]);
        await harness.commitVersion(user, datasets.raw);

        expect(await getStaleness([datasets.a, datasets.b])).toEqual({
            [datasets.a]: { reasons: ['inputs-changed'], changedInputs: [datasets.raw], distance: 0 },
            [datasets.b]: { reasons: [],                 changedInputs: [],             distance: 1 },
        });
    });

    it('new code: logic-changed; more compute alone: fresh', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b'], ['raw']);
        const recipes = await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['raw'], outputs: ['b'] },
        ]);

        await buildAll([datasets.a, datasets.b]);
        await harness.forge.recipes.publish(user, projectRid, MAIN, [
            { ...recipes.A, compute: { cpuCores: 8, memoryGb: 64 } },
            { ...recipes.B, runtimeConfig: { ...recipes.B.runtimeConfig, commit: NEW_CODE.commit } as Forge.Recipe.RuntimeConfig },
        ]);

        const staleness = await getStaleness([datasets.a, datasets.b]);

        expect(staleness[datasets.a].reasons).toEqual([]);
        expect(staleness[datasets.b].reasons).toEqual(['logic-changed']);
    });

    it('new code and new data together: both reasons', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a'], ['raw']);
        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);

        await buildAll([datasets.a]);
        await harness.commitVersion(user, datasets.raw);
        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }], MAIN, NEW_CODE);

        expect((await getStaleness([datasets.a]))[datasets.a]).toEqual({ reasons: ['logic-changed', 'inputs-changed'], changedInputs: [datasets.raw], distance: 0 });
    });

    it('a version its recipe didn\'t write — an upload over it: never-built', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a'], ['raw']);
        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);

        await buildAll([datasets.a]);
        await harness.commitVersion(user, datasets.a);

        expect((await getStaleness([datasets.a]))[datasets.a].reasons).toEqual(['never-built']);
    });

    it('the distance is to the nearest stale dataset: two stale in a chain each start again at 0', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b', 'c', 'd'], ['raw']);
        const recipes = await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['a'],   outputs: ['b'] },
            { name: 'C', inputs: ['b'],   outputs: ['c'] },
            { name: 'D', inputs: ['c'],   outputs: ['d'] },
        ]);

        await buildAll([datasets.d]);
        await harness.forge.recipes.publish(user, projectRid, MAIN, [
            { ...recipes.A, runtimeConfig: { ...recipes.A.runtimeConfig, commit: NEW_CODE.commit } as Forge.Recipe.RuntimeConfig },
            recipes.B,
            { ...recipes.C, runtimeConfig: { ...recipes.C.runtimeConfig, commit: NEW_CODE.commit } as Forge.Recipe.RuntimeConfig },
            recipes.D,
        ]);

        const staleness = await getStaleness([datasets.a, datasets.b, datasets.c, datasets.d]);

        expect({ a: staleness[datasets.a].distance, b: staleness[datasets.b].distance, c: staleness[datasets.c].distance, d: staleness[datasets.d].distance })
            .toEqual({ a: 0, b: 1, c: 0, d: 1 });
    });

    describe('a build', () => {

        it('of an up-to-date dataset: nothing to do — finished at once, with no jobs', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a'], ['raw']);
            await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);

            await buildAll([datasets.a]);

            const { build, jobs } = await harness.build(user, [datasets.a]);

            expect(build).toMatchObject({ status: 'succeeded', plan: { roots: [], children: {} } });
            expect(build.finishedAt).not.toBeNull();
            expect(jobs).toEqual({});
            expect(await harness.openTransactions(datasets.a)).toBe(0);
        });

        it('forced: everything, fresh or not', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a'], ['raw']);
            const recipes = await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);

            await buildAll([datasets.a]);

            const { jobs } = await harness.buildTarget(user, { type: 'manual', datasetRids: [datasets.a] }, 'cancel-descendants', true);

            expect(Object.values(jobs).map((job) => job.recipeRid)).toEqual([recipes.A.rid]);
        });

        it('upstream: what\'s stale and everything below it — a fresh branch beside it is read as it is', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw1', 'raw2', 'a', 'b', 'c'], ['raw1', 'raw2']);
            const recipes = await harness.publish(user, projectRid, datasets, [
                { name: 'A', inputs: ['raw1'],   outputs: ['a'] },
                { name: 'B', inputs: ['raw2'],   outputs: ['b'] },
                { name: 'C', inputs: ['a', 'b'], outputs: ['c'] },
            ]);

            await buildAll([datasets.c]);
            await harness.commitVersion(user, datasets.raw1);

            const { build, jobs } = await harness.buildTarget(user, { type: 'upstream', datasetRids: [datasets.c] });

            expect(Object.values(jobs).map((job) => job.recipeRid).sort()).toEqual([recipes.A.rid, recipes.C.rid].sort());
            expect(build.plan).toEqual({ roots: [recipes.A.rid], children: { [recipes.A.rid]: [recipes.C.rid], [recipes.C.rid]: [] } });
        });

        it('manual, of a dataset out of date only with an ancestor: nothing — its parents haven\'t changed yet', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b'], ['raw']);
            await harness.publish(user, projectRid, datasets, [
                { name: 'A', inputs: ['raw'], outputs: ['a'] },
                { name: 'B', inputs: ['a'],   outputs: ['b'] },
            ]);

            await buildAll([datasets.b]);
            await harness.commitVersion(user, datasets.raw);

            const { jobs } = await harness.build(user, [datasets.b]);

            expect(jobs).toEqual({});
        });
    });
});
