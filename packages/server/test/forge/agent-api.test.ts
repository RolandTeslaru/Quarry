import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import { TokenVerifier } from '@/auth/token-verifier';
import { ForgeHarness } from '../support/forge-fixtures';

/**
 * The rules ForgeAgents rely on: an attempt is claimed once (and its message is
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

    /** One job, scheduled, its message sent — ready to be claimed. */
    async function scheduledJob() {
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'out'], ['raw']);

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['out'] }]);

        const { jobs } = await harness.build(user, [datasets.out]);

        return Object.values(jobs)[0];
    }

    it('grants a claim once per attempt: a second claim is refused', async () => {
        const job = await scheduledJob();

        const claimed = await harness.agent.claimJob(job.rid, 1);

        expect(claimed.job.status).toBe('running');
        expect(claimed.recipe.rid).toBe(job.recipeRid);
        await expect(harness.agent.claimJob(job.rid, 1)).rejects.toBeInstanceOf(ConflictException);
    });

    it("hands the runtime a token for the build's starter, not the recipe's publisher", async () => {
        const starter = await harness.createUser();
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'out'], ['raw']);

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['out'] }]);

        const { jobs } = await harness.build(starter, [datasets.out]);
        const claimed = await harness.agent.claimJob(Object.values(jobs)[0].rid, 1);
        const actingAs = await harness.get(TokenVerifier).user(claimed.token);

        expect(actingAs.userRid).toBe(starter.userRid);
    });

    it('acks its message when it is claimed — the sweep stops sending it', async () => {
        const job = await scheduledJob();

        expect(await harness.getOutboxMessage(job)).not.toBeNull();

        await harness.agent.claimJob(job.rid, 1);

        expect(await harness.getOutboxMessage(job)).toBeNull();
    });

    it('keeps its message when the claim is refused', async () => {
        const job = await scheduledJob();

        await expect(harness.agent.claimJob(job.rid, 2)).rejects.toBeInstanceOf(ConflictException);    // not this attempt
        expect(await harness.getOutboxMessage(job)).not.toBeNull();
    });

    it('accepts a repeated finish of the same outcome, and refuses a different one', async () => {
        const job = await scheduledJob();

        await harness.agent.claimJob(job.rid, 1);
        await harness.agent.finishJob(job.rid, { attempt: 1, status: 'succeeded', failure: null });

        await expect(harness.agent.finishJob(job.rid, { attempt: 1, status: 'succeeded', failure: null }))
            .resolves.toMatchObject({ job: { status: 'succeeded' } });
        await expect(harness.agent.finishJob(job.rid, { attempt: 1, status: 'failed', failure: null }))
            .rejects.toBeInstanceOf(ConflictException);
    });

    it("refuses another attempt's claim, heartbeat and finish — the attempt is the fencing token", async () => {
        const job = await scheduledJob();

        await expect(harness.agent.claimJob(job.rid, 2)).rejects.toBeInstanceOf(ConflictException);

        await harness.agent.claimJob(job.rid, 1);

        expect(await harness.agent.heartbeatJob(job.rid, 2)).toEqual({ action: 'stop' });
        await expect(harness.agent.finishJob(job.rid, { attempt: 2, status: 'succeeded', failure: null }))
            .rejects.toBeInstanceOf(ConflictException);
        expect(await harness.agent.heartbeatJob(job.rid, 1)).toEqual({ action: 'continue' });
    });

    it("commits a succeeded job's outputs: each becomes the dataset's next version, once", async () => {
        const job = await scheduledJob();
        const [datasetRid] = Object.keys(job.outputs) as Dataset.Rid[];

        expect(await harness.transactionStatus(job.outputs[datasetRid])).toBe('open');

        await harness.run(job);
        await harness.agent.finishJob(job.rid, { attempt: 1, status: 'succeeded', failure: null });    // the agent's retry

        expect(await harness.transactionStatus(job.outputs[datasetRid])).toBe('committed');
        expect((await harness.catalog.get(user, datasetRid)).lastSequence).toBe(1);
    });

    it("aborts a failed job's outputs", async () => {
        const job = await scheduledJob();
        const [transactionRid] = Object.values(job.outputs);

        await harness.run(job, 'failed');

        expect(await harness.transactionStatus(transactionRid)).toBe('aborted');
    });
});
