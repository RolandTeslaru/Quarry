import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Catalog, type Dataset } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { CatalogHarness } from '../support/catalog-fixtures';

const LISTENER = 'test.catalog-dataset-updated';

/**
 * Catalog's durable events: `catalog:dataset:updated` is published in the commit's own transaction,
 * once per committed transaction — never for an aborted one. Read from a test listener's messages.
 */
describe('Catalog\'s durable events', () => {

    let harness: CatalogHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await CatalogHarness.start();
        user = await harness.createUser();

        await sql`insert into durable.event_listener (topic, queue_name) values (${Catalog.DurableEvent.DatasetUpdated.topic}, ${LISTENER})`.execute(harness.getOwnerDatabase());
    });

    afterAll(async () => {
        await sql`delete from durable.event_listener where queue_name = ${LISTENER}`.execute(harness.getOwnerDatabase());
        await sql`delete from durable.outbox where queue_name = ${LISTENER}`.execute(harness.getOwnerDatabase());
        await harness.stop();
    });

    /** The dataset's `catalog:dataset:updated` messages the listener hasn't acked, oldest first. */
    async function getUpdates(datasetRid: Dataset.Rid): Promise<{ jobId: string; transaction: Catalog.Transaction }[]> {
        const { rows } = await sql<{ job_id: string; payload: { transaction: Catalog.Transaction } }>`
            select job_id, payload from durable.outbox
             where queue_name = ${LISTENER} and payload -> 'transaction' ->> 'datasetRid' = ${datasetRid}
             order by id`.execute(harness.getOwnerDatabase());

        return rows.map((row) => ({ jobId: row.job_id, transaction: row.payload.transaction }));
    }

    it('publishes each commit, with the transaction as committed — its id the transaction\'s RID', async () => {
        const { datasets } = await harness.createDatasets(user, ['a']);
        const [first] = await harness.transaction.openBatch(user, [{ datasetRid: datasets.a, type: 'snapshot', provenance: {} }]);

        await harness.transaction.commitBatch(user, [first]);

        const [second] = await harness.transaction.openBatch(user, [{ datasetRid: datasets.a, type: 'append', provenance: {}, incrementalColumn: null }]);

        await harness.transaction.commitBatch(user, [second]);

        expect(await getUpdates(datasets.a)).toMatchObject([
            { jobId: first.rid,  transaction: { rid: first.rid,  datasetRid: datasets.a, branch: 'main', type: 'snapshot', status: 'committed', sequence: 1 } },
            { jobId: second.rid, transaction: { rid: second.rid, datasetRid: datasets.a, branch: 'main', type: 'append',   status: 'committed', sequence: 2 } },
        ]);
    });

    it('publishes nothing for an aborted transaction', async () => {
        const { datasets } = await harness.createDatasets(user, ['a']);
        const [aborted] = await harness.transaction.openBatch(user, [{ datasetRid: datasets.a, type: 'snapshot', provenance: {} }]);

        await harness.transaction.abortBatch(user, [aborted]);

        expect(await getUpdates(datasets.a)).toEqual([]);
    });

    it('publishes nothing when the commit fails: a batch is all or none', async () => {
        const { datasets } = await harness.createDatasets(user, ['a', 'b']);
        const [a, b] = await harness.transaction.openBatch(user, [
            { datasetRid: datasets.a, type: 'snapshot', provenance: {} },
            { datasetRid: datasets.b, type: 'snapshot', provenance: {} },
        ]);

        await harness.transaction.abortBatch(user, [b]);
        await expect(harness.transaction.commitBatch(user, [a, b])).rejects.toThrow();

        expect(await getUpdates(datasets.a)).toEqual([]);
        expect(await harness.transactionStatus(a.rid)).toBe('open');
    });
});
