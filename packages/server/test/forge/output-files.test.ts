import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Dataset, type Forge } from '@quarry/shared/domain';
import { literal } from '@quarry/integrations/core/duckdb';
import type { Principal } from '@/auth/principal';
import { FileStorage } from '@/infra/file-storage';
import { DuckDb } from '@/services/Catalog/storage/duckdb';
import { ForgeHarness } from '../support/forge-fixtures';

/**
 * How a job's outputs are written: an upload pass per file into the output's
 * open transaction, each file registered (its footer read, one schema per
 * output), and the outputs committed with the job when it succeeds.
 */
describe('output files', () => {

    let harness: ForgeHarness;
    let admin: Principal.User;

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        admin = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    /** A claimed job reading `raw` and writing `out`. */
    async function runningJob() {
        const { projectRid, datasets } = await harness.createDatasets(admin, ['raw', 'out'], ['raw']);

        await harness.publish(admin, projectRid, datasets, [{ name: 'A', inputs: ['raw'], outputs: ['out'] }]);

        const { jobs } = await harness.build(admin, [datasets.out]);
        const { job } = await harness.agent.claimJob(Object.values(jobs)[0].rid, 1);

        return { datasets, job };
    }

    /** Puts a real Parquet file where the job's runtime would: under the output's transaction. */
    async function writeParquet(job: Forge.Job.Schema, datasetRid: Dataset.Rid, filename: string, select: string): Promise<void> {
        const key = Dataset.getStorageKey(datasetRid, job.outputs[datasetRid], filename);
        const url = harness.get(FileStorage).url(key);

        await harness.get(DuckDb).with((connection) => connection.run(`COPY (${select}) TO ${literal(url)} (FORMAT parquet)`));
    }

    it("hands out a signed PUT for a file in the output's open transaction", async () => {
        const { datasets, job } = await runningJob();

        const { url } = await harness.forge.createUploadPass(admin, job.rid, datasets.out, { filename: 'part-0.parquet' });

        expect(url).toContain(`/${datasets.out}/${job.outputs[datasets.out]}/part-0.parquet?`);
        expect(url).toContain('X-Amz-Signature=');
    });

    it("refuses a dataset that isn't one of the job's outputs: 404", async () => {
        const { datasets, job } = await runningJob();

        await expect(harness.forge.createUploadPass(admin, job.rid, datasets.raw, { filename: 'part-0.parquet' }))
            .rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuses a job that isn't running: 409", async () => {
        const { datasets, job } = await runningJob();

        await harness.agent.finishJob(job.rid, { attempt: 1, status: 'failed', failure: { message: 'test failure' } });

        await expect(harness.forge.createUploadPass(admin, job.rid, datasets.out, { filename: 'part-0.parquet' }))
            .rejects.toBeInstanceOf(ConflictException);
    });

    it('commits the registered files with the job, under the schema their footers give', async () => {
        const { datasets, job } = await runningJob();

        await writeParquet(job, datasets.out, 'part-0.parquet', `SELECT 1::BIGINT AS id, 'a' AS name`);
        await writeParquet(job, datasets.out, 'part-1.parquet', `SELECT 2::BIGINT AS id, 'b' AS name`);
        await harness.forge.registerOutputFile(admin, job.rid, datasets.out, { filename: 'part-0.parquet', bytes: 100 });
        await harness.forge.registerOutputFile(admin, job.rid, datasets.out, { filename: 'part-1.parquet', bytes: 100 });

        await harness.agent.finishJob(job.rid, { attempt: 1, status: 'succeeded', failure: null });

        const view = await harness.catalog.view(admin, datasets.out);

        expect(view.sequence).toBe(1);
        expect(view.files.map((file) => file.logicalPath).sort()).toEqual(['part-0.parquet', 'part-1.parquet']);
        expect(view.files.map((file) => file.rowCount)).toEqual([1, 1]);
        expect(view.schema).toEqual({
            columns: [
                { name: 'id', type: 'long', nullable: true },
                { name: 'name', type: 'string', nullable: true },
            ],
            reader:  { format: 'parquet' },
        });
    });

    it("refuses a file whose columns differ from the output's other files: 400", async () => {
        const { datasets, job } = await runningJob();

        await writeParquet(job, datasets.out, 'part-0.parquet', `SELECT 1::BIGINT AS id`);
        await writeParquet(job, datasets.out, 'part-1.parquet', `SELECT 'x' AS other`);
        await harness.forge.registerOutputFile(admin, job.rid, datasets.out, { filename: 'part-0.parquet', bytes: 100 });

        await expect(harness.forge.registerOutputFile(admin, job.rid, datasets.out, { filename: 'part-1.parquet', bytes: 100 }))
            .rejects.toBeInstanceOf(BadRequestException);
    });
});
