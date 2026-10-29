import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@/auth/principal';
import { ForgeHarness } from '../support/forge-fixtures';

/**
 * The rules ForgeAgents rely on: an attempt starts once (and its message is
 * acked then), a finish is idempotent, a stale attempt is refused (the fencing token).
 */
describe('the ForgeAgent API', () => {

    let harness: ForgeHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    /** One job, scheduled, its message sent — ready to start. */
    async function scheduledJob() {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'out'], ['raw']);

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['out'] }]);

        const { jobs } = await harness.build(user, [datasets.out]);

        return Object.values(jobs)[0];
    }

    it('starts an attempt once: a second start is refused', async () => {
        const job = await scheduledJob();

        const started = await harness.agent.startJob(job.rid, 1);

        expect(started.job.status).toBe('running');
        expect(started.recipe.rid).toBe(job.recipeRid);
        await expect(harness.agent.startJob(job.rid, 1)).rejects.toBeInstanceOf(ConflictException);
    });

    it('acks its message when it starts — the sweep stops sending it', async () => {
        const job = await scheduledJob();

        expect(await harness.getOutboxMessage(job)).not.toBeNull();

        await harness.agent.startJob(job.rid, 1);

        expect(await harness.getOutboxMessage(job)).toBeNull();
    });

    it('keeps its message when the start is refused', async () => {
        const job = await scheduledJob();

        await expect(harness.agent.startJob(job.rid, 2)).rejects.toBeInstanceOf(ConflictException);    // not this attempt
        expect(await harness.getOutboxMessage(job)).not.toBeNull();
    });

    it('accepts a repeated finish of the same outcome, and refuses a different one', async () => {
        const job = await scheduledJob();

        await harness.agent.startJob(job.rid, 1);
        await harness.agent.finishJob(job.rid, { attempt: 1, status: 'succeeded', failure: null });

        await expect(harness.agent.finishJob(job.rid, { attempt: 1, status: 'succeeded', failure: null }))
            .resolves.toMatchObject({ job: { status: 'succeeded' } });
        await expect(harness.agent.finishJob(job.rid, { attempt: 1, status: 'failed', failure: null }))
            .rejects.toBeInstanceOf(ConflictException);
    });

    it("refuses another attempt's start, heartbeat and finish — the attempt is the fencing token", async () => {
        const job = await scheduledJob();

        await expect(harness.agent.startJob(job.rid, 2)).rejects.toBeInstanceOf(ConflictException);

        await harness.agent.startJob(job.rid, 1);

        expect(await harness.agent.heartbeatJob(job.rid, 2)).toEqual({ action: 'stop' });
        await expect(harness.agent.finishJob(job.rid, { attempt: 2, status: 'succeeded', failure: null }))
            .rejects.toBeInstanceOf(ConflictException);
        expect(await harness.agent.heartbeatJob(job.rid, 1)).toEqual({ action: 'continue' });
    });

    it('releases the outputs on finish — no compute yet, so they are aborted, not committed', async () => {
        const job = await scheduledJob();
        const [transactionRid] = Object.values(job.outputs);

        expect(await harness.transactionStatus(transactionRid)).toBe('open');

        await harness.run(job);

        expect(await harness.transactionStatus(transactionRid)).toBe('aborted');
    });
});
