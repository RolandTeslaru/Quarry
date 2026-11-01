import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { ForgeHarness } from '../support/forge-fixtures';

/**
 * What a job's runtime reads with: each input pinned to a version when the job
 * is claimed, then handed out as signed read URLs — signed URLs for exactly that
 * version's files — while it runs, to whoever can read the input.
 */
describe('signed input URLs', () => {

    let harness: ForgeHarness;
    let admin: Principal.User;

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        admin = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    /** A job reading `raw` (one committed version) into `out`, waiting to be claimed. */
    async function scheduledJob() {
        const { projectRid, datasets } = await harness.createDatasets(admin, ['raw', 'out'], ['raw']);

        await harness.publish(admin, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['out'] }]);

        const { jobs } = await harness.build(admin, [datasets.out]);

        return { projectRid, datasets, job: Object.values(jobs)[0] };
    }

    it('pins each input to its latest version when the job is claimed', async () => {
        const { datasets, job } = await scheduledJob();

        const claimed = await harness.forge.claimJob(job.rid, 1);

        expect(claimed.job.inputs).toEqual({ [datasets.raw]: 1 });
    });

    it("hands out a signed pass for each of the pinned version's files", async () => {
        const { datasets, job } = await scheduledJob();

        await harness.forge.claimJob(job.rid, 1);

        const { inputs } = await harness.jobs.getSignedInputUrls(admin, job.rid);

        expect(Object.keys(inputs)).toEqual([datasets.raw]);
        expect(inputs[datasets.raw]).toMatchObject({ sequence: 1, files: [{ bytes: 4 }] });             // the harness's one-row CSV
        expect(inputs[datasets.raw].files[0].url).toMatch(new RegExp(`/${datasets.raw}/.+/part-0\\.csv\\?.*X-Amz-Signature=`));
    });

    it("refuses a job that isn't running: 409", async () => {
        const { job } = await scheduledJob();

        await expect(harness.jobs.getSignedInputUrls(admin, job.rid)).rejects.toBeInstanceOf(ConflictException);
    });

    it("refuses someone who can't see the job: 404", async () => {
        const { job } = await scheduledJob();
        const outsider = await harness.createUser('member');

        await harness.forge.claimJob(job.rid, 1);

        await expect(harness.jobs.getSignedInputUrls(outsider, job.rid)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuses someone who sees the job but can't read its input: 403", async () => {
        const { projectRid, job } = await scheduledJob();
        const discoverer = await harness.createUser('member');

        await harness.grant(admin, projectRid, discoverer, 'discoverer');
        await harness.forge.claimJob(job.rid, 1);

        await expect(harness.jobs.getSignedInputUrls(discoverer, job.rid)).rejects.toBeInstanceOf(ForbiddenException);
    });
});
