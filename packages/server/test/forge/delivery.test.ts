import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@/auth/principal';
import { ForgeHarness } from '../support/forge-fixtures';

/**
 * How jobs reach ForgeAgents — Forge's durable queue (docs/design/durable-queues.md):
 * a job's message is added with the change that schedules it, relayed at once,
 * sent again by the sweep while unacked, and acked when the job starts or its build ends.
 */
describe('delivering jobs', () => {

    let harness: ForgeHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function chain() {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b'], ['raw']);
        const recipes = await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['a'],   outputs: ['b'] },
        ]);
        const { build } = await harness.build(user, [datasets.a, datasets.b]);
        const { jobs } = await harness.jobsByRecipe(user, build.rid, recipes);

        return { build, recipes, jobs };
    }

    it('sends a root at once (the fast path): in Redis, its outbox message marked sent', async () => {
        const { jobs } = await chain();

        expect(jobs.A.status).toBe('scheduled');
        expect(await harness.runJobQueue.getJob(`${jobs.A.rid}_1`)).toBeDefined();
        expect(await harness.getOutboxMessage(jobs.A)).toMatchObject({ sends: 1 });
        expect((await harness.getOutboxMessage(jobs.A))?.sentAt).not.toBeNull();
    });

    it("adds no message for a job still waiting on its parents", async () => {
        const { jobs } = await chain();

        expect(jobs.B.status).toBe('waiting');
        expect(await harness.getOutboxMessage(jobs.B)).toBeNull();
        expect(await harness.runJobQueue.getJob(`${jobs.B.rid}_1`)).toBeUndefined();
    });

    it('adds and sends a child once its parent succeeds', async () => {
        const { build, recipes, jobs } = await chain();

        await harness.run(jobs.A);

        const { jobs: after } = await harness.jobsByRecipe(user, build.rid, recipes);

        expect(after.B.status).toBe('scheduled');
        expect(await harness.runJobQueue.getJob(`${after.B.rid}_1`)).toBeDefined();
        expect(await harness.getOutboxMessage(after.B)).toMatchObject({ sends: 1 });
    });

    it('sends again a job no agent started in time — Redis lost its message', async () => {
        const { jobs } = await chain();

        await harness.runJobQueue.remove(`${jobs.A.rid}_1`);                         // a Redis restart
        await harness.backdateSent(jobs.A, 5);

        await harness.durableQueues.sweep();

        expect(await harness.runJobQueue.getJob(`${jobs.A.rid}_1`)).toBeDefined();
        expect(await harness.getOutboxMessage(jobs.A)).toMatchObject({ sends: 2 });
    });

    it('leaves alone a job sent recently', async () => {
        const { jobs } = await chain();

        await harness.runJobQueue.remove(`${jobs.A.rid}_1`);
        await harness.durableQueues.sweep();

        expect(await harness.runJobQueue.getJob(`${jobs.A.rid}_1`)).toBeUndefined();
    });

    it("stops sending a started job — its message was acked", async () => {
        const { jobs } = await chain();

        await harness.agent.startJob(jobs.A.rid, 1);
        await harness.runJobQueue.remove(`${jobs.A.rid}_1`);

        await harness.durableQueues.sweep();

        expect(await harness.getOutboxMessage(jobs.A)).toBeNull();
        expect(await harness.runJobQueue.getJob(`${jobs.A.rid}_1`)).toBeUndefined();
    });

    it("stops sending a canceled build's jobs", async () => {
        const { build, jobs } = await chain();

        await harness.forge.cancelBuild(user, build.rid);

        expect(await harness.getOutboxMessage(jobs.A)).toBeNull();
    });

    it("stops sending the jobs a failure cancels", async () => {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'a', 'b'], ['raw']);
        const recipes = await harness.publish(user, projectRid, datasets, [
            { name: 'A', inputs: ['raw'], outputs: ['a'] },
            { name: 'B', inputs: ['raw'], outputs: ['b'] },
        ]);
        const { build } = await harness.build(user, [datasets.a, datasets.b]);
        const { jobs } = await harness.jobsByRecipe(user, build.rid, recipes);

        expect(await harness.getOutboxMessage(jobs.B)).not.toBeNull();

        await harness.run(jobs.A, 'failed');

        expect((await harness.forge.getJob(user, jobs.B.rid)).status).toBe('canceled');
        expect(await harness.getOutboxMessage(jobs.B)).toBeNull();
    });
});
