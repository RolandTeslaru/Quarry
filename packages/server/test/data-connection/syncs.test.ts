import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataConnection } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import { DataConnectionHarness } from '../support/data-connection-fixtures';

/**
 * Syncs: creating one (with its output dataset and, if scheduled, its BullMQ
 * job scheduler), listing them, "run now", and what the system worker mirrors
 * as schedules. Nothing consumes the test's sync queue, so a queued run stays
 * there to be looked at.
 */
describe('syncs', () => {

    let harness: DataConnectionHarness;
    let user: Principal.User;

    beforeAll(async () => {
        harness = await DataConnectionHarness.start();
        user = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    /** The sync jobs waiting for a worker, for this sync. */
    async function queued(sync: DataConnection.Sync.Schema): Promise<DataConnection.Queue.Sync.Job[]> {
        const jobs = await harness.syncJobs.getJobs(['waiting', 'delayed', 'prioritized']);

        return jobs.filter((job) => job.data.syncRid === sync.rid).map((job) => job.data as DataConnection.Queue.Sync.Job);
    }

    describe('creating', () => {

        it('creates the sync and its output dataset, in the folder asked for', async () => {
            const { source, projectRid } = await harness.createSource(user);
            const sync = await harness.createSync(user, source);

            const dataset = await harness.catalog.get(user, sync.outputDatasetRid);

            expect(sync).toMatchObject({ sourceRid: source.rid, schedule: null, enabled: true, createdBy: user.userRid });
            expect(dataset).toMatchObject({ parentRid: projectRid, lastSequence: 0 });
        });

        it("stores the config as the integration's schema parsed it (defaults filled in)", async () => {
            const { source } = await harness.createSource(user);
            const sync = await harness.createSync(user, source);

            expect(sync.config).toEqual({ kind: 'table', schema: 'public', table: 'tools', incrementalColumn: 'updated_at' });
        });

        it("refuses a config the integration doesn't accept: 400, and creates no dataset", async () => {
            const { source, projectRid } = await harness.createSource(user);
            const before = await harness.library.children(user, projectRid);

            await expect(harness.dataConnection.sync.create(user, source.rid, {
                name:     'Bad',
                config:   { kind: 'table' },                         // no table
                schedule: null,
                output:   { parentRid: projectRid, name: 'Never' },
            })).rejects.toBeInstanceOf(BadRequestException);

            expect(await harness.library.children(user, projectRid)).toEqual(before);
        });

        it('refuses a second sync into an existing name — the dataset name is taken: 409', async () => {
            const { source, projectRid } = await harness.createSource(user);
            const request = { name: 'Twice', config: { kind: 'table', table: 'tools' }, schedule: null, output: { parentRid: projectRid, name: 'Same name' } };

            await harness.dataConnection.sync.create(user, source.rid, request);

            await expect(harness.dataConnection.sync.create(user, source.rid, request)).rejects.toBeInstanceOf(ConflictException);
        });

        it('upserts a job scheduler for a scheduled sync, named after it', async () => {
            const { source } = await harness.createSource(user);
            const sync = await harness.createSync(user, source, { schedule: '0 3 * * *' });

            const scheduler = await harness.syncJobs.getJobScheduler(sync.rid);

            expect(scheduler).toMatchObject({ key: sync.rid, pattern: '0 3 * * *' });
        });

        it('upserts no scheduler for a manual sync', async () => {
            const { source } = await harness.createSource(user);
            const sync = await harness.createSync(user, source);

            expect(await harness.syncJobs.getJobScheduler(sync.rid)).toBeFalsy();
        });
    });

    describe('listing', () => {

        it("lists a source's syncs by name — and only that source's", async () => {
            const { source } = await harness.createSource(user);
            const { source: other } = await harness.createSource(user);
            const a = await harness.createSync(user, source);
            const b = await harness.createSync(user, source);

            await harness.createSync(user, other);

            const listed = await harness.dataConnection.sync.list(user, source.rid);

            expect(listed.map((sync) => sync.rid).sort()).toEqual([a.rid, b.rid].sort());
            expect(listed.map((sync) => sync.name)).toEqual([...listed.map((sync) => sync.name)].sort());
        });
    });

    describe('run now', () => {

        it('queues a run that acts for whoever pressed it', async () => {
            const { source } = await harness.createSource(user);
            const sync = await harness.createSync(user, source);

            await harness.dataConnection.sync.run(user, source.rid, sync.rid);

            expect(await queued(sync)).toEqual([{ syncRid: sync.rid, trigger: 'manual', triggeredBy: user.userRid }]);
        });

        it('queues one run however often it is pressed before a worker takes it', async () => {
            const { source } = await harness.createSource(user);
            const sync = await harness.createSync(user, source);

            await harness.dataConnection.sync.run(user, source.rid, sync.rid);
            await harness.dataConnection.sync.run(user, source.rid, sync.rid);

            expect(await queued(sync)).toHaveLength(1);
        });

        it("refuses a sync of another source: 404", async () => {
            const { source } = await harness.createSource(user);
            const { source: other } = await harness.createSource(user);
            const sync = await harness.createSync(user, source);

            await expect(harness.dataConnection.sync.run(user, other.rid, sync.rid)).rejects.toBeInstanceOf(NotFoundException);
            expect(await queued(sync)).toEqual([]);
        });

        it('refuses a sync whose output dataset is trashed: 404, nothing queued', async () => {
            const { source } = await harness.createSource(user);
            const sync = await harness.createSync(user, source);

            await harness.library.trash(user, sync.outputDatasetRid);

            await expect(harness.dataConnection.sync.run(user, source.rid, sync.rid)).rejects.toBeInstanceOf(NotFoundException);
            expect(await queued(sync)).toEqual([]);
        });

        it('while a run is running, the next one the worker starts is refused (409) and the running one carries on', async () => {
            const { source } = await harness.createSource(user);
            const sync = await harness.createSync(user, source);
            const running = await harness.startRun(sync, user);

            await harness.dataConnection.sync.run(user, source.rid, sync.rid);         // queues: the queue doesn't know a run is running
            await expect(harness.startRun(sync, user)).rejects.toBeInstanceOf(ConflictException);

            expect(await harness.run(user, sync, running.runRid)).toMatchObject({ status: 'running' });
            expect(await harness.runs(user, sync)).toHaveLength(1);
        });
    });

    describe('schedules', () => {

        it('lists every scheduled sync once, with its cron — and no manual ones', async () => {
            const { source } = await harness.createSource(user);
            const nightly = await harness.createSync(user, source, { schedule: '0 3 * * *' });
            const hourly = await harness.createSync(user, source, { schedule: '0 * * * *' });
            const manual = await harness.createSync(user, source);

            const scheduled = await harness.dataConnection.sync.scheduled();
            const mine = scheduled.filter((sync) => [nightly.rid, hourly.rid, manual.rid].includes(sync.rid));

            expect(mine.sort((a, b) => a.rid.localeCompare(b.rid))).toEqual([
                { rid: nightly.rid, schedule: '0 3 * * *' },
                { rid: hourly.rid, schedule: '0 * * * *' },
            ].sort((a, b) => a.rid.localeCompare(b.rid)));
            expect(new Set(scheduled.map((sync) => sync.rid)).size).toBe(scheduled.length);
        });
    });
});
