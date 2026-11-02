import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { CatalogHarness } from '../support/catalog-fixtures';

/**
 * Catalog's batch write protocol, which builds lock and release their outputs
 * with: openBatch is all or none; abortBatch skips what's finished, so it's safe to repeat.
 */
describe('transaction batches', () => {

    let harness: CatalogHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await CatalogHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    describe('incremental state', () => {

        /** An incremental append on the dataset, committed with this mark. */
        async function appendWith(datasetRid: Dataset.Rid, incrementalState: string | null): Promise<void> {
            const [append] = await harness.transaction.openBatch(user, [{ datasetRid, type: 'append', provenance: {}, incrementalColumn: 'updated_at' }]);

            await harness.transaction.commitBatch(user, [{ ...append, incrementalState }]);
        }

        it('returns the newest committed mark, and null before there is one', async () => {
            const { datasets } = await harness.createDatasets(user, ['a']);

            expect(await harness.transaction.getIncrementalStates(user, [datasets.a])).toEqual({ [datasets.a]: null });

            await appendWith(datasets.a, '1');
            await appendWith(datasets.a, '2');

            expect(await harness.transaction.getIncrementalStates(user, [datasets.a])).toEqual({ [datasets.a]: '2' });
        });

        it('ignores an open or aborted append', async () => {
            const { datasets } = await harness.createDatasets(user, ['a']);

            await appendWith(datasets.a, '1');

            const [append] = await harness.transaction.openBatch(user, [{ datasetRid: datasets.a, type: 'append', provenance: {}, incrementalColumn: 'updated_at' }]);

            await harness.transaction.abortBatch(user, [append]);

            expect(await harness.transaction.getIncrementalStates(user, [datasets.a])).toEqual({ [datasets.a]: '1' });
        });

        it('forgets the mark after a snapshot: it replaced what the mark described', async () => {
            const { datasets } = await harness.createDatasets(user, ['a']);

            await appendWith(datasets.a, '1');

            const [snapshot] = await harness.transaction.openBatch(user, [{ datasetRid: datasets.a, type: 'snapshot', provenance: {} }]);

            await harness.transaction.commitBatch(user, [snapshot]);

            expect(await harness.transaction.getIncrementalStates(user, [datasets.a])).toEqual({ [datasets.a]: null });
        });
    });

    describe('openBatch', () => {

        it('opens one transaction on each dataset, in the order given', async () => {
            const { datasets } = await harness.createDatasets(user, ['a', 'b', 'c']);
            const order = [datasets.c, datasets.a, datasets.b];

            const opened = await harness.transaction.openBatch(user, order.map((datasetRid) => ({
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

            await harness.transaction.open(user, datasets.busy, 'append');

            const attempt = harness.transaction.openBatch(user, [
                { datasetRid: datasets.free, type: 'snapshot', provenance: {} },
                { datasetRid: datasets.busy, type: 'snapshot', provenance: {} },
            ]);

            await expect(attempt).rejects.toBeInstanceOf(ConflictException);
            await expect(attempt).rejects.toThrow(datasets.busy);
            expect(await harness.openTransactions(datasets.free)).toBe(0);
        });

        it('refuses the same dataset twice: 400', async () => {
            const { datasets } = await harness.createDatasets(user, ['a']);

            await expect(harness.transaction.openBatch(user, [
                { datasetRid: datasets.a, type: 'snapshot', provenance: {} },
                { datasetRid: datasets.a, type: 'append', provenance: {}, incrementalColumn: null },
            ])).rejects.toBeInstanceOf(BadRequestException);
        });

        it('refuses a trashed dataset: 404, opening none', async () => {
            const { datasets } = await harness.createDatasets(user, ['live', 'gone']);

            await harness.library.trash(user, datasets.gone);

            await expect(harness.transaction.openBatch(user, [
                { datasetRid: datasets.live, type: 'snapshot', provenance: {} },
                { datasetRid: datasets.gone, type: 'snapshot', provenance: {} },
            ])).rejects.toBeInstanceOf(NotFoundException);
            expect(await harness.openTransactions(datasets.live)).toBe(0);
        });

        it('opens nothing for an empty batch', async () => {
            await expect(harness.transaction.openBatch(user, [])).resolves.toEqual([]);
        });
    });

    describe('abortBatch', () => {

        it('aborts the open ones and leaves committed ones alone', async () => {
            const { datasets } = await harness.createDatasets(user, ['a', 'b']);
            const [a, b] = await harness.transaction.openBatch(user, [
                { datasetRid: datasets.a, type: 'snapshot', provenance: {} },
                { datasetRid: datasets.b, type: 'snapshot', provenance: {} },
            ]);

            await harness.transaction.commit(user, datasets.b, b.rid, null);
            await harness.transaction.abortBatch(user, [a, b]);

            expect(await harness.transactionStatus(a.rid)).toBe('aborted');
            expect(await harness.transactionStatus(b.rid)).toBe('committed');
        });

        it('is safe to repeat', async () => {
            const { datasets } = await harness.createDatasets(user, ['a']);
            const [a] = await harness.transaction.openBatch(user, [{ datasetRid: datasets.a, type: 'snapshot', provenance: {} }]);

            await harness.transaction.abortBatch(user, [a]);
            await expect(harness.transaction.abortBatch(user, [a])).resolves.toBeUndefined();
            expect(await harness.transactionStatus(a.rid)).toBe('aborted');
        });

        it("only aborts a transaction through its own dataset", async () => {
            const { datasets } = await harness.createDatasets(user, ['a', 'other']);
            const [a] = await harness.transaction.openBatch(user, [{ datasetRid: datasets.a, type: 'snapshot', provenance: {} }]);

            await harness.transaction.abortBatch(user, [{ rid: a.rid, datasetRid: datasets.other }]);

            expect(await harness.transactionStatus(a.rid)).toBe('open');
        });

        it('does nothing for an empty batch', async () => {
            await expect(harness.transaction.abortBatch(user, [])).resolves.toBeUndefined();
        });
    });
});
