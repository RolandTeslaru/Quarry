import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Catalog, CodeWorkspace, Forge, type Dataset, type Durable } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { ForgeHarness, MAIN } from '../support/forge-fixtures';

type Payload<E extends Durable.Event.Definition> = Durable.Event.PayloadOf<E>;

const LISTENERS = {
    jobSucceeded:   'test.forge-job-succeeded',
    jobFailed:      'test.forge-job-failed',
    recipeChanged:  'test.forge-recipe-changed',
    datasetUpdated: 'test.forge-dataset-updated',
} as const;

/**
 * Forge's durable events, published in the transaction that makes them true: a job's outcome once,
 * when it finishes; a recipe change only for a dataset now computed differently. Read from test
 * listeners' messages; other test files run builds meanwhile, so each test looks at its own.
 */
describe('Forge\'s durable events', () => {

    let harness: ForgeHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        user = await harness.createUser();

        await harness.listen(Forge.DurableEvent.JobSucceeded.topic, LISTENERS.jobSucceeded);
        await harness.listen(Forge.DurableEvent.JobFailed.topic, LISTENERS.jobFailed);
        await harness.listen(Forge.DurableEvent.RecipeChanged.topic, LISTENERS.recipeChanged);
        await harness.listen(Catalog.DurableEvent.DatasetUpdated.topic, LISTENERS.datasetUpdated);
    });

    afterAll(async () => {
        for (const queueName of Object.values(LISTENERS))
            await harness.unlisten(queueName);

        await harness.stop();
    });

    async function getJobEvents(queueName: string, job: Forge.Job) {
        const events = await harness.getEvents<Payload<typeof Forge.DurableEvent.JobSucceeded>>(queueName);

        return events.filter((event) => event.payload.job.rid === job.rid);
    }

    async function getDatasetUpdates(datasetRid: Dataset.Rid) {
        const events = await harness.getEvents<Payload<typeof Catalog.DurableEvent.DatasetUpdated>>(LISTENERS.datasetUpdated);

        return events.filter((event) => event.payload.transaction.datasetRid === datasetRid);
    }

    async function getRecipeChanges(datasetRids: Dataset.Rid[]) {
        const events = await harness.getEvents<Payload<typeof Forge.DurableEvent.RecipeChanged>>(LISTENERS.recipeChanged);

        return events.filter((event) => datasetRids.includes(event.payload.datasetRid)).map((event) => event.payload);
    }

    /** One job on a fresh dataset, scheduled — ready for the test to play its agent. */
    async function scheduledJob(): Promise<{ job: Forge.Job; out: Dataset.Rid }> {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'out'], ['raw']);

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['out'] }]);

        const { jobs } = await harness.build(user, [datasets.out]);

        return { job: Object.values(jobs)[0], out: datasets.out };
    }

    describe('a job finishing', () => {

        it('succeeded: forge:job:succeeded once, with the job as it finished — and catalog:dataset:updated for its output', async () => {
            const { job, out } = await scheduledJob();

            await harness.run(job);

            const succeeded = await getJobEvents(LISTENERS.jobSucceeded, job);

            expect(succeeded).toHaveLength(1);
            expect(succeeded[0].eventId).toBe(job.rid);
            expect(succeeded[0].payload.job).toMatchObject({ rid: job.rid, status: 'succeeded' });
            expect(await getJobEvents(LISTENERS.jobFailed, job)).toEqual([]);
            expect(await getDatasetUpdates(out)).toMatchObject([{ payload: { transaction: { rid: job.outputTransactions[out], status: 'committed' } } }]);
        });

        it('failed: forge:job:failed once, with its failure — and no new version', async () => {
            const { job, out } = await scheduledJob();

            await harness.run(job, 'failed');

            const failed = await getJobEvents(LISTENERS.jobFailed, job);

            expect(failed).toHaveLength(1);
            expect(failed[0].payload.job).toMatchObject({ rid: job.rid, status: 'failed', failure: { message: 'test failure' } });
            expect(await getJobEvents(LISTENERS.jobSucceeded, job)).toEqual([]);
            expect(await getDatasetUpdates(out)).toEqual([]);
        });

        it('a repeated finish publishes nothing more', async () => {
            const { job } = await scheduledJob();

            await harness.run(job);
            await expect(harness.forge.finishJob(job.rid, { attempt: 1, status: 'succeeded', failure: null, incrementalStates: {} }))
                .rejects.toBeInstanceOf(ConflictException);

            expect(await getJobEvents(LISTENERS.jobSucceeded, job)).toHaveLength(1);
        });
    });

    describe('recipes published', () => {

        it('a dataset computed for the first time: forge:recipe:changed, with its new recipe', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b']);
            const recipes = await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a', 'b'] }]);

            expect(await getRecipeChanges([datasets.a, datasets.b])).toEqual(expect.arrayContaining([
                { datasetRid: datasets.a, branch: 'main', producerRid: projectRid, recipeRid: recipes.A.rid },
                { datasetRid: datasets.b, branch: 'main', producerRid: projectRid, recipeRid: recipes.A.rid },
            ]));
            expect(await getRecipeChanges([datasets.raw])).toEqual([]);                    // read, not computed
        });

        it('a republish computing it the same way: nothing, though the recipe is new', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a']);

            await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);
            await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);

            expect(await getRecipeChanges([datasets.a])).toHaveLength(1);
        });

        it('new code, new inputs or a new way of writing it: a change', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'other', 'a']);
            const workspaceRid = CodeWorkspace.Rid.parse('ri.code-workspace.main.workspace.01a1729a-975b-70de-8141-89cca28b34d2');

            await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);
            await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }], MAIN, { workspaceRid, commit: CodeWorkspace.Git.Commit.parse('b'.repeat(40)) });
            await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw', 'other'], outputs: ['a'] }]);
            await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw', 'other'], outputs: ['a'], outputTransaction: { type: 'append', incrementalColumn: null } }]);

            expect(await getRecipeChanges([datasets.a])).toHaveLength(4);
        });

        it('more compute alone: nothing — it computes the dataset the same way', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a']);
            const { A } = await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);

            await harness.forge.recipes.publish(user, projectRid, A.branch, [{
                runtimeConfig:      A.runtimeConfig,
                inputDatasetRids:   A.inputDatasetRids,
                outputTransactions: A.outputTransactions,
                compute:            { cpuCores: 8, memoryGb: 64 },
            }]);

            expect(await getRecipeChanges([datasets.a])).toHaveLength(1);
        });

        it('a dataset no longer computed: forge:recipe:changed with no recipe', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b']);

            await harness.publish(user, projectRid, datasets, [
                { name: 'A', inputs: ['raw'], outputs: ['a'] },
                { name: 'B', inputs: ['raw'], outputs: ['b'] },
            ]);
            await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['a'] }]);

            expect((await getRecipeChanges([datasets.b])).map((change) => change.recipeRid)).toEqual([expect.any(String), null]);
            expect(await getRecipeChanges([datasets.a])).toHaveLength(1);
        });
    });
});
