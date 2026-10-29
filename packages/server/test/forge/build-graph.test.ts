import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@/auth/principal';
import { ForgeHarness } from '../support/forge-fixtures';

/**
 * Builds of several jobs that depend on each other: the plan, the order they
 * become runnable, and how a failure or a cancel ends the build. The test plays
 * the ForgeAgent (start, finish), so the order is the test's, not a race.
 */
describe('a build of several dependent datasets', () => {

    let harness: ForgeHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    it('runs a chain one job at a time: A → B → C', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b', 'c'], ['raw']);
        const recipes = await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['a'],   outputs: ['b'] },
            { name: 'C', inputs: ['b'],   outputs: ['c'] },
        ]);

        const { build } = await harness.build(user, [datasets.a, datasets.b, datasets.c]);

        expect(build.plan.roots).toEqual([recipes.A.rid]);
        expect(build.plan.children).toEqual({ [recipes.A.rid]: [recipes.B.rid], [recipes.B.rid]: [recipes.C.rid], [recipes.C.rid]: [] });
        expect(await harness.statuses(user, build.rid, recipes)).toEqual({ A: 'scheduled', B: 'waiting', C: 'waiting' });

        let { jobs } = await harness.jobsByRecipe(user, build.rid, recipes);
        await harness.run(jobs.A);
        expect(await harness.statuses(user, build.rid, recipes)).toEqual({ A: 'succeeded', B: 'scheduled', C: 'waiting' });

        ({ jobs } = await harness.jobsByRecipe(user, build.rid, recipes));
        await harness.run(jobs.B);
        expect(await harness.statuses(user, build.rid, recipes)).toEqual({ A: 'succeeded', B: 'succeeded', C: 'scheduled' });

        ({ jobs } = await harness.jobsByRecipe(user, build.rid, recipes));
        await harness.run(jobs.C);

        const done = await harness.jobsByRecipe(user, build.rid, recipes);
        expect(done.build.status).toBe('succeeded');
        expect(Object.values(done.jobs).every((job) => job.status === 'succeeded')).toBe(true);
    });

    it('waits for every parent in a diamond: D runs only after both B and C', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b', 'c', 'd'], ['raw']);
        const recipes = await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'],    outputs: ['a'] },
            { name: 'B', inputs: ['a'],      outputs: ['b'] },
            { name: 'C', inputs: ['a'],      outputs: ['c'] },
            { name: 'D', inputs: ['b', 'c'], outputs: ['d'] },
        ]);

        const { build } = await harness.build(user, [datasets.a, datasets.b, datasets.c, datasets.d]);

        expect(build.plan.roots).toEqual([recipes.A.rid]);
        expect([...build.plan.children[recipes.A.rid]].sort()).toEqual([recipes.B.rid, recipes.C.rid].sort());
        expect(build.plan.children[recipes.B.rid]).toEqual([recipes.D.rid]);
        expect(build.plan.children[recipes.C.rid]).toEqual([recipes.D.rid]);

        let { jobs } = await harness.jobsByRecipe(user, build.rid, recipes);
        await harness.run(jobs.A);
        expect(await harness.statuses(user, build.rid, recipes)).toEqual({ A: 'succeeded', B: 'scheduled', C: 'scheduled', D: 'waiting' });

        ({ jobs } = await harness.jobsByRecipe(user, build.rid, recipes));
        await harness.run(jobs.B);
        expect((await harness.statuses(user, build.rid, recipes)).D).toBe('waiting');     // C hasn't finished

        ({ jobs } = await harness.jobsByRecipe(user, build.rid, recipes));
        await harness.run(jobs.C);
        expect((await harness.statuses(user, build.rid, recipes)).D).toBe('scheduled');

        ({ jobs } = await harness.jobsByRecipe(user, build.rid, recipes));
        await harness.run(jobs.D);
        expect((await harness.jobsByRecipe(user, build.rid, recipes)).build.status).toBe('succeeded');
    });

    it('starts every independent root at once: A, B, C → D', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b', 'c', 'd'], ['raw']);
        const recipes = await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'],         outputs: ['a'] },
            { name: 'B', inputs: ['raw'],         outputs: ['b'] },
            { name: 'C', inputs: ['raw'],         outputs: ['c'] },
            { name: 'D', inputs: ['a', 'b', 'c'], outputs: ['d'] },
        ]);

        const { build } = await harness.build(user, [datasets.a, datasets.b, datasets.c, datasets.d]);

        expect([...build.plan.roots].sort()).toEqual([recipes.A.rid, recipes.B.rid, recipes.C.rid].sort());
        expect(await harness.statuses(user, build.rid, recipes)).toEqual({ A: 'scheduled', B: 'scheduled', C: 'scheduled', D: 'waiting' });

        // Each root is in the queue for a ForgeAgent.
        const { jobs } = await harness.jobsByRecipe(user, build.rid, recipes);

        for (const name of ['A', 'B', 'C'])
            expect(await harness.runJobQueue.getJob(`${jobs[name].rid}_1`)).toBeDefined();
    });

    it('runs a recipe with several outputs as one job, and its readers after it', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a1', 'a2', 'b', 'c'], ['raw']);
        const recipes = await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a1', 'a2'] },
            { name: 'B', inputs: ['a1'],  outputs: ['b'] },
            { name: 'C', inputs: ['a2'],  outputs: ['c'] },
        ]);

        // Targeting only a1: A still writes a2 (a job's outputs update together).
        const single = await harness.build(user, [datasets.a1]);
        const [job] = Object.values(single.jobs);

        expect(Object.keys(single.jobs)).toHaveLength(1);
        expect(Object.keys(job.outputs).sort()).toEqual([datasets.a1, datasets.a2].sort());
        await harness.forge.cancelBuild(user, single.build.rid);

        const { build } = await harness.build(user, [datasets.a1, datasets.a2, datasets.b, datasets.c]);

        expect(Object.keys(build.plan.children)).toHaveLength(3);                     // A, B, C — not one node per output
        expect([...build.plan.children[recipes.A.rid]].sort()).toEqual([recipes.B.rid, recipes.C.rid].sort());

        const { jobs } = await harness.jobsByRecipe(user, build.rid, recipes);
        await harness.run(jobs.A);
        expect(await harness.statuses(user, build.rid, recipes)).toEqual({ A: 'succeeded', B: 'scheduled', C: 'scheduled' });
    });

    it('cancels the rest when a job fails, and aborts their outputs', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b', 'c', 'd'], ['raw']);
        const recipes = await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'],    outputs: ['a'] },
            { name: 'B', inputs: ['a'],      outputs: ['b'] },
            { name: 'C', inputs: ['a'],      outputs: ['c'] },
            { name: 'D', inputs: ['b', 'c'], outputs: ['d'] },
        ]);

        const { build } = await harness.build(user, [datasets.a, datasets.b, datasets.c, datasets.d]);

        let { jobs } = await harness.jobsByRecipe(user, build.rid, recipes);
        await harness.run(jobs.A);

        ({ jobs } = await harness.jobsByRecipe(user, build.rid, recipes));
        await harness.run(jobs.B, 'failed');

        const after = await harness.jobsByRecipe(user, build.rid, recipes);

        expect(after.build.status).toBe('failed');
        expect(await harness.statuses(user, build.rid, recipes)).toEqual({ A: 'succeeded', B: 'failed', C: 'canceled', D: 'canceled' });
        expect(after.jobs.B.failure).toEqual({ message: 'test failure' });

        for (const job of Object.values(after.jobs))
            for (const transactionRid of Object.values(job.outputs))
                expect(await harness.transactionStatus(transactionRid)).toBe('aborted');
    });

    it('cancels a build mid-way: unfinished jobs canceled, their outputs released', async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b'], ['raw']);
        const recipes = await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['a'],   outputs: ['b'] },
        ]);

        const { build } = await harness.build(user, [datasets.a, datasets.b]);
        const { jobs } = await harness.jobsByRecipe(user, build.rid, recipes);

        await harness.agent.startJob(jobs.A.rid, 1);                                   // A running, B waiting

        const canceled = await harness.forge.cancelBuild(user, build.rid);

        expect(canceled.build.status).toBe('canceled');
        expect(await harness.statuses(user, build.rid, recipes)).toEqual({ A: 'canceled', B: 'canceled' });
        expect(await harness.transactionStatus(jobs.B.outputs[datasets.b])).toBe('aborted');

        // The running job's agent hears it on its next heartbeat; a new build can write the outputs again.
        expect(await harness.agent.heartbeatJob(jobs.A.rid, 1)).toEqual({ action: 'stop' });
        await expect(harness.build(user, [datasets.a, datasets.b])).resolves.toBeDefined();
    });
});
