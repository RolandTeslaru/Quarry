import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@/auth/principal';
import { ForgeHarness } from '../support/forge-fixtures';

/**
 * Catalog's batch write protocol, which builds lock and release their outputs
 * with: openBatch is all or none; abortBatch skips what's finished, so it's safe to repeat.
 */
describe('transaction batches', () => {

    let harness: ForgeHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    describe('openBatch', () => {

        it('opens one transaction on each dataset, in the order given', async () => {
            const { datasets } = await harness.createDatasets(user, ['a', 'b', 'c']);
            const order = [datasets.c, datasets.a, datasets.b];

            const opened = await harness.catalog.transaction.openBatch(user, order.map((datasetRid) => ({
                datasetRid,
                type:       'snapshot' as const,
                provenance: { test: true },
            })));

            expect(opened.map((transaction) => transaction.datasetRid)).toEqual(order);
            expect(opened.every((transaction) => transaction.status === 'open' && transaction.branch === 'main')).toBe(true);
            expect(opened[0].provenance).toEqual({ test: true });
        });

        it('opens none if one dataset is already being written: 409 naming it', async () => {
            const { datasets } = await harness.createDatasets(user, ['free', 'busy']);

            await harness.catalog.transaction.open(user, datasets.busy, 'append');

            const attempt = harness.catalog.transaction.openBatch(user, [
                { datasetRid: datasets.free, type: 'snapshot' },
                { datasetRid: datasets.busy, type: 'snapshot' },
            ]);

            await expect(attempt).rejects.toBeInstanceOf(ConflictException);
            await expect(attempt).rejects.toThrow(datasets.busy);
            expect(await harness.openTransactions(datasets.free)).toBe(0);
        });

        it('refuses the same dataset twice: 400', async () => {
            const { datasets } = await harness.createDatasets(user, ['a']);

            await expect(harness.catalog.transaction.openBatch(user, [
                { datasetRid: datasets.a, type: 'snapshot' },
                { datasetRid: datasets.a, type: 'append' },
            ])).rejects.toBeInstanceOf(BadRequestException);
        });

        it('refuses a trashed dataset: 404, opening none', async () => {
            const { datasets } = await harness.createDatasets(user, ['live', 'gone']);

            await harness.library.trash(user, datasets.gone);

            await expect(harness.catalog.transaction.openBatch(user, [
                { datasetRid: datasets.live, type: 'snapshot' },
                { datasetRid: datasets.gone, type: 'snapshot' },
            ])).rejects.toBeInstanceOf(NotFoundException);
            expect(await harness.openTransactions(datasets.live)).toBe(0);
        });

        it('opens nothing for an empty batch', async () => {
            await expect(harness.catalog.transaction.openBatch(user, [])).resolves.toEqual([]);
        });
    });

    describe('abortBatch', () => {

        it('aborts the open ones and leaves committed ones alone', async () => {
            const { datasets } = await harness.createDatasets(user, ['a', 'b']);
            const [a, b] = await harness.catalog.transaction.openBatch(user, [
                { datasetRid: datasets.a, type: 'snapshot' },
                { datasetRid: datasets.b, type: 'snapshot' },
            ]);

            await harness.catalog.transaction.commit(user, datasets.b, b.rid, null);
            await harness.catalog.transaction.abortBatch(user, [a, b]);

            expect(await harness.transactionStatus(a.rid)).toBe('aborted');
            expect(await harness.transactionStatus(b.rid)).toBe('committed');
        });

        it('is safe to repeat', async () => {
            const { datasets } = await harness.createDatasets(user, ['a']);
            const [a] = await harness.catalog.transaction.openBatch(user, [{ datasetRid: datasets.a, type: 'snapshot' }]);

            await harness.catalog.transaction.abortBatch(user, [a]);
            await expect(harness.catalog.transaction.abortBatch(user, [a])).resolves.toBeUndefined();
            expect(await harness.transactionStatus(a.rid)).toBe('aborted');
        });

        it("only aborts a transaction through its own dataset", async () => {
            const { datasets } = await harness.createDatasets(user, ['a', 'other']);
            const [a] = await harness.catalog.transaction.openBatch(user, [{ datasetRid: datasets.a, type: 'snapshot' }]);

            await harness.catalog.transaction.abortBatch(user, [{ rid: a.rid, datasetRid: datasets.other }]);

            expect(await harness.transactionStatus(a.rid)).toBe('open');
        });

        it('does nothing for an empty batch', async () => {
            await expect(harness.catalog.transaction.abortBatch(user, [])).resolves.toBeUndefined();
        });
    });
});
