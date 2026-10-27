import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataConnection, Identity } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import { DataConnectionHarness } from '../support/data-connection-fixtures';

/**
 * Live updates: every change to a run is published on its source's channel
 * as `data-connection:run:updated`, with the run as it is now; a failed run
 * also notifies whoever it acted for, on their own channel. Listened to on
 * Redis, as the RealtimeGateway does.
 */
describe('run events', () => {

    let harness: DataConnectionHarness;
    let user: Principal.User;
    let listener: Redis;
    const runEvents: DataConnection.Event[] = [];
    const notifications: Identity.Event[] = [];

    beforeAll(async () => {
        harness = await DataConnectionHarness.start();
        user = await harness.createUser();

        listener = new Redis(process.env.REDIS_URL ?? '');
        await listener.psubscribe('data-connection:source:*', 'identity:user:*');
        listener.on('pmessage', (pattern, _channel, message) => {
            if (pattern === 'data-connection:source:*')
                runEvents.push(DataConnection.Event.Schema.parse(JSON.parse(message)));
            else
                notifications.push(Identity.Event.Schema.parse(JSON.parse(message)));
        });
    });

    afterAll(async () => {
        await listener.quit();
        await harness.stop();
    });

    /** The source's run events so far, as `<n>:<status>` (n: the run's order of appearance), once at least `count` have arrived. */
    async function eventsOf(source: DataConnection.Source.Schema, count: number): Promise<string[]> {
        const deadline = Date.now() + 5_000;

        const mine = () => {
            const events = runEvents.filter((event) => event.channel === DataConnection.Event.getChannel(source.rid));
            const order = [...new Set(events.map((event) => event.run.rid))];

            return events.map((event) => `${order.indexOf(event.run.rid) + 1}:${event.run.status}`);
        };

        while (mine().length < count && Date.now() < deadline)
            await new Promise((resolve) => setTimeout(resolve, 20));

        return mine();
    }

    /** Notification titles sent to this user so far, once at least `count` have arrived. */
    async function notificationsOf(member: Principal.User, count: number): Promise<string[]> {
        const deadline = Date.now() + 5_000;

        const mine = () => notifications
            .filter((event) => event.channel === Identity.Event.getChannel(member.userRid))
            .map((event) => (event.type === 'identity:notification' ? event.title : event.type));

        while (mine().length < count && Date.now() < deadline)
            await new Promise((resolve) => setTimeout(resolve, 20));

        return mine();
    }

    it('announces a run starting and succeeding, in order, with the run as it is', async () => {
        const { source } = await harness.createSource(user);
        const sync = await harness.createSync(user, source);
        const started = await harness.startRun(sync, user);

        await harness.completeRun(started, [2], 'a');

        expect(await eventsOf(source, 2)).toEqual(['1:running', '1:succeeded']);

        const succeeded = runEvents.find((event) => event.run.rid === started.runRid && event.run.status === 'succeeded');

        expect(succeeded?.run).toMatchObject({ rowCount: 2, stateTo: 'a', transactionRid: started.transactionRid });
    });

    it('announces a failed run, and tells whoever pressed run', async () => {
        const { source } = await harness.createSource(user);
        const sync = await harness.createSync(user, source);
        const started = await harness.startRun(sync, user);

        await harness.dataConnection.run.fail(started.runRid, 'connection reset');

        expect(await eventsOf(source, 2)).toEqual(['1:running', '1:failed']);
        expect(await notificationsOf(user, 1)).toContain(`Sync "${sync.name}" failed`);
    });

    it("announces a reaped run, and tells the sync's creator when a schedule started it", async () => {
        const creator = await harness.createUser();
        const { source } = await harness.createSource(creator);
        const sync = await harness.createSync(creator, source, { schedule: '0 3 * * *' });
        const started = await harness.startRun(sync, null);

        await harness.backdateHeartbeat(started.runRid, 10);
        await harness.dataConnection.run.reap(5);

        expect(await eventsOf(source, 2)).toEqual(['1:running', '1:failed']);
        expect(await notificationsOf(creator, 1)).toEqual([`Sync "${sync.name}" failed`]);
    });

    it('announces nothing for a start refused because a run is already running', async () => {
        const { source } = await harness.createSource(user);
        const sync = await harness.createSync(user, source);

        await harness.startRun(sync, user);
        await expect(harness.startRun(sync, user)).rejects.toThrow();
        await harness.dataConnection.run.heartbeat((await harness.runs(user, sync))[0].rid);

        expect(await eventsOf(source, 1)).toEqual(['1:running']);
    });

    it('announces runs in the order they happened, across consecutive runs', async () => {
        const { source } = await harness.createSource(user);
        const sync = await harness.createSync(user, source);

        await harness.completeRun(await harness.startRun(sync, user), [1], '1');
        await harness.dataConnection.run.fail((await harness.startRun(sync, user)).runRid, 'boom');
        await harness.completeRun(await harness.startRun(sync, user), [1], '2');

        expect(await eventsOf(source, 6)).toEqual(['1:running', '1:succeeded', '2:running', '2:failed', '3:running', '3:succeeded']);
    });

    it("publishes each source's runs on its own channel only", async () => {
        const { source: a } = await harness.createSource(user);
        const { source: b } = await harness.createSource(user);

        await harness.startRun(await harness.createSync(user, a), user);
        await harness.startRun(await harness.createSync(user, b), user);

        expect(await eventsOf(a, 1)).toEqual(['1:running']);
        expect(await eventsOf(b, 1)).toEqual(['1:running']);

        const syncsOf = new Map<string, string>();

        for (const event of runEvents) {
            const owner = syncsOf.get(event.run.syncRid) ?? event.channel;

            syncsOf.set(event.run.syncRid, owner);
            expect(event.channel).toBe(owner);
        }
    });
});
