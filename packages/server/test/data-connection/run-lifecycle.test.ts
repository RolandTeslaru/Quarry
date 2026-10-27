import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataConnection } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import { DataConnectionHarness } from '../support/data-connection-fixtures';

/**
 * A sync run as the Data Connection worker drives it through the server:
 * start → heartbeat → complete or fail, and the reaper for workers that died.
 * The test plays the worker, so every step happens when the test says.
 */
describe('sync run lifecycle', () => {

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

    describe('start', () => {

        it('records a running run and opens a transaction on the output dataset', async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, user);

            expect(started.datasetRid).toBe(sync.outputDatasetRid);
            expect(started.destination).toContain(`${sync.outputDatasetRid}/${started.transactionRid}/`);
            expect(await harness.transactionStatus(started.transactionRid)).toBe('open');

            const run = await harness.run(user, sync, started.runRid);

            expect(run).toMatchObject({
                status:         'running',
                transactionRid: started.transactionRid,
                trigger:        'manual',
                triggeredBy:    user.userRid,
                stateFrom:      null,
                finishedAt:     null,
            });
        });

        it('opens an append transaction for an incremental sync and a snapshot for a full copy', async () => {
            const append = await harness.startRun(await newSync(), user);
            const snapshot = await harness.startRun(await newSync({ snapshot: true }), user);

            expect(await harness.transactionType(append.transactionRid)).toBe('append');
            expect(await harness.transactionType(snapshot.transactionRid)).toBe('snapshot');
        });

        it('records a scheduled run as acting for no one in particular', async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, null);

            expect(await harness.run(user, sync, started.runRid)).toMatchObject({ trigger: 'schedule', triggeredBy: null });
        });

        it('skips a sync that no longer exists', async () => {
            await expect(harness.dataConnection.run.start({
                syncRid:     DataConnection.Sync.createRid(),
                trigger:     'schedule',
                triggeredBy: null,
            })).resolves.toEqual({ skipped: true });
        });
    });

    describe('one run per sync at a time', () => {

        it('refuses a second start while a run is running: 409, and records nothing', async () => {
            const sync = await newSync();
            const first = await harness.startRun(sync, user);

            await expect(harness.startRun(sync, user)).rejects.toBeInstanceOf(ConflictException);

            const runs = await harness.runs(user, sync);

            expect(runs.map((run) => run.rid)).toEqual([first.runRid]);
            expect(runs[0].status).toBe('running');
        });

        it('lets the next run start once the previous one finished', async () => {
            const sync = await newSync();
            const first = await harness.startRun(sync, user);

            await harness.completeRun(first, [1], '1');

            const second = await harness.startRun(sync, user);

            expect(second.runRid).not.toBe(first.runRid);
            expect(await harness.run(user, sync, second.runRid)).toMatchObject({ status: 'running' });
        });
    });

    describe('heartbeat', () => {

        it("renews a running run's heartbeat", async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, user);

            await harness.backdateHeartbeat(started.runRid, 10);
            const before = (await harness.run(user, sync, started.runRid)).heartbeatAt;

            await harness.dataConnection.run.heartbeat(started.runRid);

            expect((await harness.run(user, sync, started.runRid)).heartbeatAt.getTime()).toBeGreaterThan(before.getTime());
        });

        it('leaves a finished run alone', async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, user);

            await harness.completeRun(started, [1], '1');
            const before = await harness.run(user, sync, started.runRid);

            await harness.dataConnection.run.heartbeat(started.runRid);

            expect(await harness.run(user, sync, started.runRid)).toEqual(before);
        });
    });

    describe('complete', () => {

        it('marks the run succeeded with its row count and state, and commits its transaction', async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, user);

            const completed = await harness.completeRun(started, [3, 4], '2026-10-27');

            expect(completed).toEqual({ transactionRid: started.transactionRid, files: 2 });
            expect(await harness.run(user, sync, started.runRid)).toMatchObject({ status: 'succeeded', rowCount: 7, stateTo: '2026-10-27' });
            expect((await harness.run(user, sync, started.runRid)).finishedAt).not.toBeNull();
            expect(await harness.transactionStatus(started.transactionRid)).toBe('committed');
        });

        it('refuses a second complete: 409, and the dataset keeps one version', async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, user);

            await harness.completeRun(started, [2], 'a');

            await expect(harness.completeRun(started, [5], 'b')).rejects.toBeInstanceOf(ConflictException);

            expect(await harness.run(user, sync, started.runRid)).toMatchObject({ status: 'succeeded', rowCount: 2, stateTo: 'a' });
            expect(await harness.view(user, sync.outputDatasetRid)).toMatchObject({ sequence: 1, rowCount: 2 });
        });

        it('refuses to complete a failed run: 409, and nothing is committed', async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, user);

            await harness.dataConnection.run.fail(started.runRid, 'copy failed');

            await expect(harness.completeRun(started, [2], 'a')).rejects.toBeInstanceOf(ConflictException);

            expect(await harness.run(user, sync, started.runRid)).toMatchObject({ status: 'failed', stateTo: null });
            expect(await harness.view(user, sync.outputDatasetRid)).toMatchObject({ sequence: 0 });
        });
    });

    describe('fail', () => {

        it("marks the run failed with the worker's message and aborts its transaction", async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, user);

            await harness.dataConnection.run.fail(started.runRid, 'connection reset');

            const run = await harness.run(user, sync, started.runRid);

            expect(run).toMatchObject({ status: 'failed', error: { reason: 'error', message: 'connection reset' } });
            expect(run.finishedAt).not.toBeNull();
            expect(await harness.transactionStatus(started.transactionRid)).toBe('aborted');
        });

        it('refuses to fail a succeeded run: 409, and its data stays committed', async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, user);

            await harness.completeRun(started, [2], 'a');

            await expect(harness.dataConnection.run.fail(started.runRid, 'late')).rejects.toBeInstanceOf(ConflictException);

            expect(await harness.run(user, sync, started.runRid)).toMatchObject({ status: 'succeeded' });
            expect(await harness.transactionStatus(started.transactionRid)).toBe('committed');
        });

        it('refuses to fail a run twice: 409, and keeps the first reason', async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, user);

            await harness.dataConnection.run.fail(started.runRid, 'first');

            await expect(harness.dataConnection.run.fail(started.runRid, 'second')).rejects.toBeInstanceOf(ConflictException);

            expect(await harness.run(user, sync, started.runRid)).toMatchObject({ error: { message: 'first' } });
        });
    });

    describe('the reaper', () => {

        it('fails a run whose heartbeats stopped, and aborts its transaction', async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, user);

            await harness.backdateHeartbeat(started.runRid, 10);

            expect(await harness.dataConnection.run.reap(5)).toBeGreaterThanOrEqual(1);

            expect(await harness.run(user, sync, started.runRid)).toMatchObject({ status: 'failed', error: { reason: 'worker lost' } });
            expect(await harness.transactionStatus(started.transactionRid)).toBe('aborted');
        });

        it('leaves a run that is still heartbeating alone', async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, user);

            await harness.backdateHeartbeat(started.runRid, 2);
            await harness.dataConnection.run.reap(5);

            expect(await harness.run(user, sync, started.runRid)).toMatchObject({ status: 'running' });
            expect(await harness.transactionStatus(started.transactionRid)).toBe('open');
        });

        it('leaves finished runs alone, however old their last heartbeat', async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, user);

            await harness.completeRun(started, [1], 'a');
            await harness.backdateHeartbeat(started.runRid, 60);
            await harness.dataConnection.run.reap(5);

            expect(await harness.run(user, sync, started.runRid)).toMatchObject({ status: 'succeeded' });
            expect(await harness.transactionStatus(started.transactionRid)).toBe('committed');
        });

        it('frees the sync: the next run can start after a reaped one', async () => {
            const sync = await newSync();
            const started = await harness.startRun(sync, user);

            await harness.backdateHeartbeat(started.runRid, 10);
            await harness.dataConnection.run.reap(5);

            await expect(harness.startRun(sync, user)).resolves.toMatchObject({ skipped: false });
        });
    });
});
