import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@/auth/principal';
import { ForgeHarness } from '../support/forge-fixtures';

/**
 * The relay: the fast path queues roots at once; the sweep re-sends what it
 * didn't deliver — a job left scheduled, and a queued job whose message Redis
 * lost — and leaves everything else alone.
 */
describe('the relay', () => {

    let harness: ForgeHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function queuedJob() {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'out'], ['raw']);

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['out'] }]);

        const { jobs } = await harness.build(user, [datasets.out]);

        return Object.values(jobs)[0];
    }

    it('queues a root at once (the fast path): in Redis, marked queued', async () => {
        const job = await queuedJob();

        expect(job.status).toBe('queued');
        expect(job.queuedAt).not.toBeNull();
        expect(await harness.runJobs.getJob(`${job.rid}_1`)).toBeDefined();
    });

    it('re-sends a job the fast path left scheduled', async () => {
        const job = await queuedJob();

        await harness.runJobs.remove(`${job.rid}_1`);
        await harness.setStatus(job.rid, 'scheduled');

        await harness.relay.sweep(2);

        expect((await harness.forge.getJob(user, job.rid)).status).toBe('queued');
        expect(await harness.runJobs.getJob(`${job.rid}_1`)).toBeDefined();
    });

    it('re-sends a queued job no agent started in time — Redis lost it — and restarts its clock', async () => {
        const job = await queuedJob();

        await harness.runJobs.remove(`${job.rid}_1`);
        await harness.backdateQueued(job.rid, 5);

        await harness.relay.sweep(2);

        const after = await harness.forge.getJob(user, job.rid);

        expect(await harness.runJobs.getJob(`${job.rid}_1`)).toBeDefined();
        expect(Date.now() - (after.queuedAt?.getTime() ?? 0)).toBeLessThan(60_000);
    });

    it('leaves alone a job queued recently, and one already running', async () => {
        const recent = await queuedJob();
        const running = await queuedJob();

        await harness.agent.startJob(running.rid, 1);
        await harness.runJobs.remove(`${recent.rid}_1`);
        await harness.runJobs.remove(`${running.rid}_1`);

        await harness.relay.sweep(2);

        expect(await harness.runJobs.getJob(`${recent.rid}_1`)).toBeUndefined();
        expect(await harness.runJobs.getJob(`${running.rid}_1`)).toBeUndefined();
        expect((await harness.forge.getJob(user, running.rid)).status).toBe('running');
    });
});
