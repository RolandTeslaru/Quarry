import { NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataConnection } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import { db } from '@/db/pool';
import { DataConnectionHarness } from '../support/data-connection-fixtures';

/**
 * What a run publishes: on complete, the files under its transaction's prefix
 * become a committed version of the output dataset, and the run's state is
 * what the next run starts from. A failed run publishes nothing and moves no state.
 */
describe('publishing a run', () => {

    let harness: DataConnectionHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await DataConnectionHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function newSync(options: { snapshot?: boolean } = {}): Promise<DataConnection.Sync.Schema> {
        const { source } = await harness.createSource(user);

        return harness.createSync(user, source, options);
    }

    describe('the dataset', () => {

        it("gets a new committed version with the copy's files, row count and schema", async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, user);

            await harness.completeRun(started, [10, 5], '5');

            const view = await harness.view(user, sync.outputDatasetRid);

            expect(view).toMatchObject({ sequence: 1, rowCount: 15, schema: { columns: [{ name: 'id', type: 'long' }] } });
            expect(view.files.map((file) => file.logicalPath).sort()).toEqual([
                `${started.transactionRid}/data_0.parquet`,
                `${started.transactionRid}/data_1.parquet`,
            ]);
            expect((await harness.catalog.get(user, sync.outputDatasetRid)).lastSequence).toBe(1);
        });

        it("registers only Parquet under the run's own prefix — not other files beside it, nor objects elsewhere in the dataset", async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, user);
            const request = await harness.writeCopy(started, [4], 'a');

            await harness.writeObject(`${started.datasetRid}/${started.transactionRid}/_SUCCESS`);
            await harness.writeObject(`${started.datasetRid}/not-this-run/data_0.parquet`);

            await expect(harness.dataConnection.run.complete(started.runRid, request)).resolves.toMatchObject({ files: 1 });

            const view = await harness.view(user, sync.outputDatasetRid);

            expect(view.files.map((file) => file.logicalPath)).toEqual([`${started.transactionRid}/data_0.parquet`]);
            expect(view.rowCount).toBe(4);
        });

        it('takes each file\'s row count from the worker, by key', async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, user);

            await harness.completeRun(started, [7, 0, 2], 'a');

            const view = await harness.view(user, sync.outputDatasetRid);
            const counts = Object.fromEntries(view.files.map((file) => [file.logicalPath.split('/')[1], file.rowCount]));

            expect(counts).toEqual({ 'data_0.parquet': 7, 'data_1.parquet': 0, 'data_2.parquet': 2 });
        });

        it('adds to the dataset on each run of an incremental sync', async () => {
            const sync = await newSync();

            await harness.completeRun(await harness.startRun(sync, user), [3], '3');
            await harness.completeRun(await harness.startRun(sync, user), [2], '5');

            expect(await harness.view(user, sync.outputDatasetRid)).toMatchObject({ sequence: 2, rowCount: 5 });
        });

        it('replaces the dataset on each run of a full copy', async () => {
            const sync = await newSync({ snapshot: true });

            await harness.completeRun(await harness.startRun(sync, user), [3], null);
            await harness.completeRun(await harness.startRun(sync, user), [2], null);

            const view = await harness.view(user, sync.outputDatasetRid);

            expect(view).toMatchObject({ sequence: 2, rowCount: 2 });
            expect(view.files).toHaveLength(1);
        });
    });

    describe('the state', () => {

        it("starts the first run from nothing, and the next one from the last run's state", async () => {
            const sync = await newSync();
            const first = await harness.startRun(sync, user);

            await harness.completeRun(first, [1], '2026-10-01');

            const second = await harness.startRun(sync, user);

            expect(first.state).toBeNull();
            expect(second.state).toBe('2026-10-01');
            expect(await harness.run(user, sync, second.runRid)).toMatchObject({ stateFrom: '2026-10-01' });
        });

        it('keeps moving forward, run after run', async () => {
            const sync = await newSync();

            for (const state of ['1', '2', '3'])
                await harness.completeRun(await harness.startRun(sync, user), [1], state);

            const next = await harness.startRun(sync, user);

            expect(next.state).toBe('3');
        });
    });

    describe('a failed run', () => {

        it('publishes nothing: the dataset keeps its version, the transaction is aborted', async () => {
            const sync = await newSync();

            await harness.completeRun(await harness.startRun(sync, user), [3], '3');

            const failed = await harness.startRun(sync, user);

            await harness.writeCopy(failed, [100], '103');
            await harness.dataConnection.run.fail(failed.runRid, 'copy failed');

            expect(await harness.view(user, sync.outputDatasetRid)).toMatchObject({ sequence: 1, rowCount: 3 });
            expect(await harness.transactionStatus(failed.transactionRid)).toBe('aborted');
        });

        it("doesn't move the state: the next run starts where the last successful one left off", async () => {
            const sync = await newSync();

            await harness.completeRun(await harness.startRun(sync, user), [3], '3');

            const failed = await harness.startRun(sync, user);

            await harness.dataConnection.run.fail(failed.runRid, 'copy failed');

            const next = await harness.startRun(sync, user);

            expect(next.state).toBe('3');
            expect(await harness.run(user, sync, failed.runRid)).toMatchObject({ stateTo: null });
        });

        it("doesn't move the state when the reaper fails it either", async () => {
            const sync = await newSync();

            await harness.completeRun(await harness.startRun(sync, user), [3], '3');

            const lost = await harness.startRun(sync, user);

            await harness.backdateHeartbeat(lost.runRid, 10);
            await harness.dataConnection.run.reap(5);

            expect((await harness.startRun(sync, user)).state).toBe('3');
        });
    });

    /**
     * The run and its published data are recorded together or not at all —
     * whichever step fails, the run's status, the dataset's version and the
     * next run's state agree.
     */
    describe('the run and its data, together or not at all', () => {

        it('a complete the Catalog refuses (output trashed mid-run) commits nothing and leaves the run for the worker to fail', async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, user);
            const request = await harness.writeCopy(started, [4], '4');

            await harness.library.trash(user, sync.outputDatasetRid);

            await expect(harness.dataConnection.run.complete(started.runRid, request)).rejects.toBeInstanceOf(NotFoundException);

            expect(await harness.run(user, sync, started.runRid)).toMatchObject({ status: 'running', stateTo: null });
            expect(await harness.transactionStatus(started.transactionRid)).toBe('open');

            // The worker's catch: fail the run, which aborts the transaction (aborting works on a trashed dataset).
            await harness.dataConnection.run.fail(started.runRid, 'output trashed');

            expect(await harness.run(user, sync, started.runRid)).toMatchObject({ status: 'failed' });
            expect(await harness.transactionStatus(started.transactionRid)).toBe('aborted');
        });

        it('a duplicate complete after success changes neither the run nor the data', async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, user);
            const request = await harness.writeCopy(started, [4], '4');

            await harness.dataConnection.run.complete(started.runRid, request);
            await expect(harness.dataConnection.run.complete(started.runRid, request)).rejects.toThrow();

            expect(await harness.view(user, sync.outputDatasetRid)).toMatchObject({ sequence: 1, rowCount: 4 });
            expect((await harness.startRun(sync, user)).state).toBe('4');
        });

        /**
         * KNOWN BUG — expected to fail until it's fixed (docs/design/data-connection.md §7).
         * `complete` commits the Catalog transaction, then marks the run succeeded,
         * in two database transactions. A failure between them — simulated by a
         * trigger refusing the run's update — leaves the data committed and the run
         * `running`; the reaper later fails it, so the next incremental run starts
         * from the previous state and copies the same rows again.
         */
        it.fails('a failure between the commit and marking the run succeeded leaves both or neither', async () => {
            const sync = await newSync();

            await harness.completeRun(await harness.startRun(sync, user), [3], '3');

            const started = await harness.startRun(sync, user);
            const request = await harness.writeCopy(started, [2], '5');

            await refuseSucceeding(started.runRid, async () => {
                await expect(harness.dataConnection.run.complete(started.runRid, request)).rejects.toThrow();
            });

            const committed = (await harness.view(user, sync.outputDatasetRid)).sequence === 2;
            const succeeded = (await harness.run(user, sync, started.runRid)).status === 'succeeded';

            expect({ committed, succeeded }).toEqual({ committed, succeeded: committed });

            // And what that costs: once the reaper fails the run, the next run starts before the committed rows.
            await harness.backdateHeartbeat(started.runRid, 10);
            await harness.dataConnection.run.reap(5);

            expect((await harness.startRun(sync, user)).state).toBe(committed ? '5' : '3');
        });
    });
});

/**
 * While `fn` runs, Postgres refuses to mark this run succeeded — a crash at
 * exactly that point, which the code can't produce on demand.
 */
async function refuseSucceeding(runRid: DataConnection.SyncRun.Rid, fn: () => Promise<void>): Promise<void> {
    await sql`
        create or replace function pg_temp_refuse_succeeding() returns trigger language plpgsql as $$
        begin
            if new.status = 'succeeded' and new.rid = tg_argv[0] then
                raise exception 'simulated crash before the run is marked succeeded';
            end if;

            return new;
        end $$`.execute(db());

    await sql.raw(`
        create trigger refuse_succeeding before update on data_connection.sync_run
        for each row execute function pg_temp_refuse_succeeding('${runRid}')`).execute(db());

    try {
        await fn();
    }
    finally {
        await sql`drop trigger refuse_succeeding on data_connection.sync_run`.execute(db());
        await sql`drop function pg_temp_refuse_succeeding()`.execute(db());
    }
}
