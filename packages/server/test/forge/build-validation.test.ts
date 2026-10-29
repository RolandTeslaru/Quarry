import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Foundations } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import { ForgeHarness, MAIN } from '../support/forge-fixtures';

/** What a build refuses before it locks anything, and the lock itself: all of a build's outputs, or none. */
describe('initializing a build', () => {

    let harness: ForgeHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    it('refuses a target nothing produces: 409', async () => {
        const { datasets } = await harness.createDatasets(user, ['lonely']);

        await expect(harness.build(user, [datasets.lonely])).rejects.toThrow(/Nothing builds/);
    });

    it("refuses an input that has no data and isn't built here: 409", async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['empty', 'out']);

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['empty'], outputs: ['out'] }]);

        await expect(harness.build(user, [datasets.out])).rejects.toThrow(/has no data yet/);
        expect(await harness.openTransactions(datasets.out)).toBe(0);
    });

    it('accepts an input with no data when this build writes it first', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'mid', 'out'], ['raw']);

        await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['mid'] },
            { name: 'B', inputs: ['mid'], outputs: ['out'] },
        ]);

        const { build } = await harness.build(user, [datasets.mid, datasets.out]);

        expect(Object.keys(build.plan.children)).toHaveLength(2);
        await harness.forge.cancelBuild(user, build.rid);
    });

    it('refuses recipes that read each other in a cycle: 409', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['a', 'b']);

        await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['b'], outputs: ['a'] },
            { name: 'B', inputs: ['a'], outputs: ['b'] },
        ]);

        await expect(harness.build(user, [datasets.a, datasets.b])).rejects.toThrow(/cycle/);
        expect(await harness.openTransactions(datasets.a)).toBe(0);
    });

    it('refuses upstream and connecting targets for now: 400', async () => {
        const { datasets } = await harness.createDatasets(user, ['a']);

        await expect(harness.forge.initializeBuild(user, {
            branch: MAIN, fallbackBranches: [], target: { type: 'upstream', datasetRids: [datasets.a] },
            forceBuild: false, abortOnFailure: false, retryCount: 0,
        })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses branches other than main for now: 400', async () => {
        const { datasets } = await harness.createDatasets(user, ['a']);

        await expect(harness.forge.initializeBuild(user, {
            branch: Foundations.Branch.parse('testing'), fallbackBranches: [], target: { type: 'manual', datasetRids: [datasets.a] },
            forceBuild: false, abortOnFailure: false, retryCount: 0,
        })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('builds from a recipe on a fallback branch', async () => {
        const testing = Foundations.Branch.parse('testing');
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'out'], ['raw']);
        const recipes = await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['out'] }], testing);

        const created = await harness.forge.initializeBuild(user, {
            branch: MAIN, fallbackBranches: [testing], target: { type: 'manual', datasetRids: [datasets.out] },
            forceBuild: false, abortOnFailure: false, retryCount: 0,
        });

        expect(Object.values(created.jobs)[0].recipeRid).toBe(recipes.A.rid);
        await harness.forge.cancelBuild(user, created.build.rid);
    });

    it('builds a target listed twice as one job', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'out'], ['raw']);

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['out'] }]);

        const { build, jobs } = await harness.build(user, [datasets.out, datasets.out]);

        expect(Object.keys(jobs)).toHaveLength(1);
        await harness.forge.cancelBuild(user, build.rid);
    });

    it('refuses a trashed target: 404', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'out'], ['raw']);

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['out'] }]);
        await harness.library.trash(user, datasets.out);

        await expect(harness.build(user, [datasets.out])).rejects.toBeInstanceOf(NotFoundException);
    });

    describe('locking the outputs', () => {

        it('holds one open transaction on every output of every job until the build ends', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a1', 'a2', 'b'], ['raw']);

            await harness.publish(user, projectRid, datasets, [
                { name: 'A', inputs: ['raw'], outputs: ['a1', 'a2'] },
                { name: 'B', inputs: ['a1'],  outputs: ['b'] },
            ]);

            const { build } = await harness.build(user, [datasets.a1, datasets.b]);

            for (const name of ['a1', 'a2', 'b'])
                expect(await harness.openTransactions(datasets[name])).toBe(1);

            await harness.forge.cancelBuild(user, build.rid);

            for (const name of ['a1', 'a2', 'b'])
                expect(await harness.openTransactions(datasets[name])).toBe(0);
        });

        it('refuses an output already being written — 409 naming it — and opens none of the others', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'free', 'busy'], ['raw']);

            await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['free', 'busy'] }]);
            await harness.catalog.transaction.open(user, datasets.busy, 'append');           // an upload in progress

            const attempt = harness.build(user, [datasets.free]);

            await expect(attempt).rejects.toBeInstanceOf(ConflictException);
            await expect(attempt).rejects.toThrow(datasets.busy);
            expect(await harness.openTransactions(datasets.free)).toBe(0);
            expect(await harness.openTransactions(datasets.busy)).toBe(1);                    // the upload's, untouched
        });

        it('refuses a second build of the same outputs while the first runs', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'out'], ['raw']);

            await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['out'] }]);

            const first = await harness.build(user, [datasets.out]);

            await expect(harness.build(user, [datasets.out])).rejects.toBeInstanceOf(ConflictException);

            await harness.forge.cancelBuild(user, first.build.rid);
            await expect(harness.build(user, [datasets.out])).resolves.toBeDefined();
        });

        it('lets an upload in once the build finished', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'out'], ['raw']);

            await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['out'] }]);

            const { jobs } = await harness.build(user, [datasets.out]);

            await expect(harness.catalog.transaction.open(user, datasets.out, 'append')).rejects.toBeInstanceOf(ConflictException);

            await harness.run(Object.values(jobs)[0]);

            await expect(harness.catalog.transaction.open(user, datasets.out, 'append')).resolves.toMatchObject({ status: 'open' });
        });
    });
});
