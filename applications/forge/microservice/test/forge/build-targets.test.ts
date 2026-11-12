import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { ForgeHarness } from '../support/forge-fixtures';

/**
 * Which recipes a build's target resolves to: a manual build runs the targets' own, an upstream build
 * every recipe above them too, a connecting build only those between its inputs and its targets.
 */
describe('a build\'s target', () => {

    let harness: ForgeHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    describe('upstream', () => {

        it('builds the targets and every recipe above them, in order: A → B → C for c', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b', 'c'], ['raw']);
            const recipes = await harness.publish(user, projectRid, datasets, [
                { name: 'A', inputs: ['raw'], outputs: ['a'] },
                { name: 'B', inputs: ['a'],   outputs: ['b'] },
                { name: 'C', inputs: ['b'],   outputs: ['c'] },
            ]);

            const { build } = await harness.buildTarget(user, { type: 'upstream', datasetRids: [datasets.c] });

            expect(build.plan.roots).toEqual([recipes.A.rid]);
            expect(build.plan.children).toEqual({ [recipes.A.rid]: [recipes.B.rid], [recipes.B.rid]: [recipes.C.rid], [recipes.C.rid]: [] });
            expect(await harness.statuses(user, build.rid, recipes)).toEqual({ A: 'scheduled', B: 'waiting', C: 'waiting' });
        });

        it('reaches a recipe by two paths once: a diamond above d is four jobs', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b', 'c', 'd'], ['raw']);
            const recipes = await harness.publish(user, projectRid, datasets, [
                { name: 'A', inputs: ['raw'],    outputs: ['a'] },
                { name: 'B', inputs: ['a'],      outputs: ['b'] },
                { name: 'C', inputs: ['a'],      outputs: ['c'] },
                { name: 'D', inputs: ['b', 'c'], outputs: ['d'] },
            ]);

            const { build, jobs } = await harness.buildTarget(user, { type: 'upstream', datasetRids: [datasets.d] });

            expect(Object.keys(jobs)).toHaveLength(4);
            expect(build.plan.roots).toEqual([recipes.A.rid]);
            expect(build.plan.children[recipes.D.rid]).toEqual([]);
        });

        it('stops at a dataset nothing builds — read as it is — and leaves other branches of the graph alone', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b', 'other'], ['raw']);
            const recipes = await harness.publish(user, projectRid, datasets, [
                { name: 'A',     inputs: ['raw'], outputs: ['a'] },
                { name: 'B',     inputs: ['a'],   outputs: ['b'] },
                { name: 'Other', inputs: ['raw'], outputs: ['other'] },        // beside, not above
            ]);

            const { jobs } = await harness.buildTarget(user, { type: 'upstream', datasetRids: [datasets.b] });
            const built = Object.values(jobs).map((job) => job.recipeRid).sort();

            expect(built).toEqual([recipes.A.rid, recipes.B.rid].sort());
        });

        it('runs a recipe with several outputs once, though only one of them is read', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a1', 'a2', 'b'], ['raw']);
            const recipes = await harness.publish(user, projectRid, datasets, [
                { name: 'A', inputs: ['raw'], outputs: ['a1', 'a2'] },
                { name: 'B', inputs: ['a1'],  outputs: ['b'] },
            ]);

            const { build, jobs } = await harness.buildTarget(user, { type: 'upstream', datasetRids: [datasets.b] });
            const { jobs: byName } = await harness.jobsByRecipe(user, build.rid, recipes);

            expect(Object.keys(jobs)).toHaveLength(2);
            expect(Object.keys(byName.A.outputs).sort()).toEqual([datasets.a1, datasets.a2].sort());
        });

        it('refuses a target nothing builds', async () => {
            const { datasets } = await harness.createDatasets(user, ['raw'], ['raw']);

            await expect(harness.buildTarget(user, { type: 'upstream', datasetRids: [datasets.raw] })).rejects.toBeInstanceOf(ConflictException);
        });
    });

    describe('connecting', () => {

        it('builds only what lies between the inputs and the targets: B → C for a … c, not A', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b', 'c'], ['raw', 'a']);
            const recipes = await harness.publish(user, projectRid, datasets, [
                { name: 'A', inputs: ['raw'], outputs: ['a'] },
                { name: 'B', inputs: ['a'],   outputs: ['b'] },
                { name: 'C', inputs: ['b'],   outputs: ['c'] },
            ]);

            const { build } = await harness.buildTarget(user, { type: 'connecting', inputRids: [datasets.a], datasetRids: [datasets.c] });

            expect(build.plan.roots).toEqual([recipes.B.rid]);
            expect(build.plan.children).toEqual({ [recipes.B.rid]: [recipes.C.rid], [recipes.C.rid]: [] });
        });

        it('leaves out a recipe above the targets that doesn\'t read from the inputs — its output is read as it is', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'x', 'c'], ['raw', 'a', 'x']);
            const recipes = await harness.publish(user, projectRid, datasets, [
                { name: 'A', inputs: ['raw'],    outputs: ['a'] },
                { name: 'X', inputs: ['raw'],    outputs: ['x'] },
                { name: 'C', inputs: ['a', 'x'], outputs: ['c'] },
            ]);

            const { jobs } = await harness.buildTarget(user, { type: 'connecting', inputRids: [datasets.a], datasetRids: [datasets.c] });

            expect(Object.values(jobs).map((job) => job.recipeRid)).toEqual([recipes.C.rid]);
        });

        it('never builds an input, even one downstream of another input', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b', 'c'], ['raw', 'a', 'b']);
            const recipes = await harness.publish(user, projectRid, datasets, [
                { name: 'A', inputs: ['raw'], outputs: ['a'] },
                { name: 'B', inputs: ['a'],   outputs: ['b'] },
                { name: 'C', inputs: ['b'],   outputs: ['c'] },
            ]);

            const { jobs } = await harness.buildTarget(user, { type: 'connecting', inputRids: [datasets.a, datasets.b], datasetRids: [datasets.c] });

            expect(Object.values(jobs).map((job) => job.recipeRid)).toEqual([recipes.C.rid]);
        });

        it('refuses inputs the targets don\'t read from', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'unrelated', 'c'], ['raw', 'unrelated']);

            await harness.publish(user, projectRid, datasets, [{ name: 'C', inputs: ['raw'], outputs: ['c'] }]);

            await expect(harness.buildTarget(user, { type: 'connecting', inputRids: [datasets.unrelated], datasetRids: [datasets.c] }))
                .rejects.toBeInstanceOf(ConflictException);
        });
    });
});
