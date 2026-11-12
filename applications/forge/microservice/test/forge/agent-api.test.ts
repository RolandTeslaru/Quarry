import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { TokenVerifier } from '@quarry/platform-kernel/auth/token-verifier';
import { ForgeHarness } from '../support/forge-fixtures';

/**
 * The rules ForgeAgents rely on: an attempt is claimed once (and its message is
 * acked then), a stale attempt is refused (the fencing token).
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

        const claimed = await harness.forge.claimJob(job.rid, 1);

        expect(claimed.job.status).toBe('running');
        expect(claimed.recipe.rid).toBe(job.recipeRid);
        await expect(harness.forge.claimJob(job.rid, 1)).rejects.toBeInstanceOf(ConflictException);
    });

    it("hands the runtime a token for the build's starter, not the recipe's publisher", async () => {
        const starter = await harness.createUser();
        const { projectRid, datasets } = await harness.createDatasets(user, ['raw', 'out'], ['raw']);

        await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['out'] }]);

        const { jobs } = await harness.build(starter, [datasets.out]);
        const claimed = await harness.forge.claimJob(Object.values(jobs)[0].rid, 1);
        const actingAs = await harness.get(TokenVerifier).user(claimed.token);

        expect(actingAs.userRid).toBe(starter.userRid);
    });

    it('acks its message when it is claimed — the sweep stops sending it', async () => {
        const job = await scheduledJob();

        expect(await harness.getOutboxMessage(job)).not.toBeNull();

        await harness.forge.claimJob(job.rid, 1);

        expect(await harness.getOutboxMessage(job)).toBeNull();
    });

    it('keeps its message when the claim is refused', async () => {
        const job = await scheduledJob();

        await expect(harness.forge.claimJob(job.rid, 2)).rejects.toBeInstanceOf(ConflictException);    // not this attempt
        expect(await harness.getOutboxMessage(job)).not.toBeNull();
    });

    it("refuses another attempt's claim, heartbeat and finish — the attempt is the fencing token", async () => {
        const job = await scheduledJob();

        await expect(harness.forge.claimJob(job.rid, 2)).rejects.toBeInstanceOf(ConflictException);

        await harness.forge.claimJob(job.rid, 1);

        expect(await harness.jobs.heartbeatJob(job.rid, 2)).toEqual({ action: 'stop' });
        await expect(harness.forge.finishJob(job.rid, { attempt: 2, status: 'succeeded', failure: null, incrementalStates: {} }))
            .rejects.toBeInstanceOf(ConflictException);
        expect(await harness.jobs.heartbeatJob(job.rid, 1)).toEqual({ action: 'continue' });
    });

    it("commits a succeeded job's outputs: each becomes the dataset's next version", async () => {
        const job = await scheduledJob();
        const [datasetRid] = Object.keys(job.outputTransactions) as Dataset.Rid[];

        expect(await harness.transactionStatus(job.outputTransactions[datasetRid])).toBe('open');

        await harness.run(job);

        expect(await harness.transactionStatus(job.outputTransactions[datasetRid])).toBe('committed');
        expect((await harness.catalog.get(user, { rid: datasetRid })).lastSequence).toBe(1);
    });

    describe('an incremental output', () => {

        /** A recipe appending to one dataset, by a column. */
        async function incrementalRecipe() {
            const { projectRid, datasets } = await harness.createDatasets(user, ['out']);

            await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: [], outputs: ['out'], outputTransaction: { type: 'append', incrementalColumn: 'updated_at' } }]);

            return datasets.out;
        }

        /** Builds the dataset and claims its job. Forced: with no inputs, it reads a source Forge can't see — never out of date, as a sync. */
        async function claimNext(datasetRid: Dataset.Rid) {
            const { jobs } = await harness.buildTarget(user, { type: 'manual', datasetRids: [datasetRid] }, 'cancel-descendants', true);
            const [job] = Object.values(jobs);

            return harness.forge.claimJob(job.rid, job.attempt);
        }

        it('starts with no mark, and picks up where the last run got to', async () => {
            const out = await incrementalRecipe();
            const first = await claimNext(out);

            expect(first.incrementalStates).toEqual({ [out]: null });

            await harness.forge.finishJob(first.job.rid, { attempt: 1, status: 'succeeded', failure: null, incrementalStates: { [out]: '2026-11-01' } });

            expect((await claimNext(out)).incrementalStates).toEqual({ [out]: '2026-11-01' });
        });

        it("doesn't advance the mark when the run fails", async () => {
            const out = await incrementalRecipe();
            const first = await claimNext(out);

            await harness.forge.finishJob(first.job.rid, { attempt: 1, status: 'succeeded', failure: null, incrementalStates: { [out]: 'a' } });

            const second = await claimNext(out);

            await harness.forge.finishJob(second.job.rid, { attempt: 1, status: 'failed', failure: { message: 'no' }, incrementalStates: { [out]: 'b' } });

            expect((await claimNext(out)).incrementalStates).toEqual({ [out]: 'a' });
        });

        it('gives a snapshot output no mark', async () => {
            const { projectRid, datasets } = await harness.createDatasets(user, ['out']);

            await harness.publish(user, projectRid, datasets, [{ name: 'A', inputs: [], outputs: ['out'] }]);

            expect((await claimNext(datasets.out)).incrementalStates).toEqual({});
        });
    });

    it("aborts a failed job's outputs", async () => {
        const job = await scheduledJob();
        const [transactionRid] = Object.values(job.outputTransactions);

        await harness.run(job, 'failed');

        expect(await harness.transactionStatus(transactionRid)).toBe('aborted');
    });
});
