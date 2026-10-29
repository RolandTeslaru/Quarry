import { BadRequestException, ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Foundations } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import { ForgeHarness, MAIN } from '../support/forge-fixtures';

/**
 * Publishing recipes: one producer per dataset per branch, a publish replaces
 * the producer's pointers on that branch, and history stays.
 */
describe('publishing recipes', () => {

    let harness: ForgeHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    it('points each output at the recipe that writes it', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b']);
        const recipes = await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a', 'b'] },
        ]);

        expect(recipes.A.inputDatasetRids).toEqual([datasets.raw]);
        expect([...recipes.A.outputDatasetRids].sort()).toEqual([datasets.a, datasets.b].sort());
        expect(recipes.A.publishedBy).toBe(user.userRid);

        for (const output of ['a', 'b'])
            expect((await harness.forge.recipes.getCurrent(user, datasets[output], [MAIN]))?.rid).toBe(recipes.A.rid);

        expect(await harness.forge.recipes.getCurrent(user, datasets.raw, [MAIN])).toBeNull();     // read, not produced
    });

    it('moves the pointers to the new recipe on republish', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a']);
        const first = await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);
        const second = await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);

        expect(second.A.rid).not.toBe(first.A.rid);
        expect((await harness.forge.recipes.getCurrent(user, datasets.a, [MAIN]))?.rid).toBe(second.A.rid);
    });

    it('drops the pointer of an output the producer no longer declares — the dataset stays', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b']);

        await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['raw'], outputs: ['b'] },
        ]);
        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);

        expect(await harness.forge.recipes.getCurrent(user, datasets.b, [MAIN])).toBeNull();
        expect(await harness.forge.recipes.getCurrent(user, datasets.a, [MAIN])).not.toBeNull();
        await expect(harness.catalog.get(user, datasets.b)).resolves.toMatchObject({ rid: datasets.b });
    });

    it('an empty publish drops every pointer the producer had on the branch', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a']);

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);
        await harness.publish(user, projectRid, datasets, []);

        expect(await harness.forge.recipes.getCurrent(user, datasets.a, [MAIN])).toBeNull();
    });

    it('refuses two recipes writing the same dataset in one publish: 400', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a']);

        await expect(harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['raw'], outputs: ['a'] },
        ])).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a dataset another producer already produces: 409, naming it — and changes nothing', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a']);
        const { projectRid: otherProducer } = await harness.createDatasets(user, []);
        const owner = await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);

        const attempt = harness.publish(user, otherProducer, datasets, [{ name: 'X', inputs: ['raw'], outputs: ['a'] }]);

        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
        await expect(attempt).rejects.toThrow(projectRid);
        expect((await harness.forge.recipes.getCurrent(user, datasets.a, [MAIN]))?.rid).toBe(owner.A.rid);
    });

    it('keeps branches apart: a recipe on testing is current there only', async () => {
        const testing = Foundations.Branch.parse('testing');
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a']);
        const onMain = await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);
        const onTesting = await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }], testing);

        expect((await harness.forge.recipes.getCurrent(user, datasets.a, [MAIN]))?.rid).toBe(onMain.A.rid);
        expect((await harness.forge.recipes.getCurrent(user, datasets.a, [testing]))?.rid).toBe(onTesting.A.rid);
    });

    it('finds the recipe on the first branch that has one', async () => {
        const testing = Foundations.Branch.parse('testing');
        const feature = Foundations.Branch.parse('feature/x');
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a']);
        const onTesting = await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }], testing);

        expect((await harness.forge.recipes.getCurrent(user, datasets.a, [feature, testing, MAIN]))?.rid).toBe(onTesting.A.rid);
        expect(await harness.forge.recipes.getCurrent(user, datasets.a, [feature])).toBeNull();
    });
});
