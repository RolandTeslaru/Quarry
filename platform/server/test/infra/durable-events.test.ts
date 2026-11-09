import { Queue } from 'bullmq';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Durable } from '@quarry/shared/domain';
import { QUEUE_PREFIX, redisConnection } from '@quarry/shared/server/redis';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { db } from '@quarry/platform-kernel/db/pool';
import { Repository, Transactional } from '@quarry/platform-kernel/db/repository';
import { DurableEventHandle, DurableQueueHandle, DurableQueueInternalController, DurableQueues } from '@quarry/platform-kernel/infra/durable';
import { OutboxDB } from '@quarry/platform-kernel/infra/durable/outbox/outbox.db';
import { OutboxRepository } from '@quarry/platform-kernel/infra/durable/outbox/outbox.repository';
import { MainServerHarness } from '../support/main-server-fixtures';

const TestEvent = Durable.Event.define({
    topic:   'test:thing:happened',
    payload: z.object({ n: z.number().int() }),
});

const UnheardEvent = Durable.Event.define({
    topic:   'test:thing:ignored',
    payload: z.object({}),
});

const ListenerA = Durable.EventListener.define({ event: TestEvent, queue: 'test.listener-a' });
const ListenerB = Durable.EventListener.define({ event: TestEvent, queue: 'test.listener-b' });

const SERVICE = Principal.SELF('test');

/** A publisher's repository, reduced to the part that matters: publishing inside its own transaction; and a listener's take. */
class TestDomainRepository extends Repository(OutboxDB.database) {

    constructor(
        private readonly testEvent:   DurableEventHandle<typeof TestEvent>,
        private readonly unheardEvent: DurableEventHandle<typeof UnheardEvent>,
        private readonly listenerA:   DurableQueueHandle<typeof ListenerA.queue>,
    ) {
        super();
    }

    @Transactional()
    public async happen(principal: Principal, events: { n: number; eventId: string }[], fail = false): Promise<void> {
        await this.testEvent.publish(events.map(({ n, eventId }) => ({ payload: { n }, eventId })));

        if (fail)
            throw new Error('the change failed');
    }

    @Transactional()
    public async happenUnheard(principal: Principal, eventId: string): Promise<void> {
        await this.unheardEvent.publish([{ payload: {}, eventId }]);
    }

    @Transactional()
    public async takeAsA(principal: Principal, eventIds: string[]): Promise<void> {
        await this.listenerA.ack(eventIds);
    }
}

/**
 * Durable events (docs/design/durable-queues.md): publishing joins the publisher's transaction and adds
 * a message for each listener in durable.event_listener; each listener's queue is relayed, swept and
 * acked as any durable queue. Over a throwaway topic, `test:thing:happened`, with two listeners.
 */
describe('durable events', () => {

    let harness: MainServerHarness;
    let durableQueues: DurableQueues;
    let testEvent: DurableEventHandle<typeof TestEvent>;
    let domain: TestDomainRepository;
    let user: Principal.User;
    const redisA = new Queue(ListenerA.name, { connection: redisConnection(), prefix: QUEUE_PREFIX });
    const redisB = new Queue(ListenerB.name, { connection: redisConnection(), prefix: QUEUE_PREFIX });

    beforeAll(async () => {
        harness = await MainServerHarness.start();
        durableQueues = harness.get(DurableQueues);
        durableQueues.register(ListenerA);
        testEvent = new DurableEventHandle(TestEvent, harness.get(OutboxRepository), durableQueues);
        domain = new TestDomainRepository(
            testEvent,
            new DurableEventHandle(UnheardEvent, harness.get(OutboxRepository), durableQueues),
            new DurableQueueHandle(ListenerA, harness.get(OutboxRepository), durableQueues),
        );
        user = await harness.createUser('member');

        await sql`
            insert into durable.event_listener (topic, queue_name)
            values (${TestEvent.topic}, ${ListenerA.name}), (${TestEvent.topic}, ${ListenerB.name})`.execute(db());
    });

    beforeEach(async () => {
        await redisA.obliterate({ force: true });
        await redisB.obliterate({ force: true });
        await sql`delete from durable.outbox where queue_name like 'test.%'`.execute(db());
    });

    afterAll(async () => {
        await sql`delete from durable.event_listener where topic like 'test:%'`.execute(db());
        await redisA.close();
        await redisB.close();
        await harness.stop();
    });

    async function getOutbox(): Promise<{ queue_name: string; job_id: string; payload: unknown }[]> {
        const { rows } = await sql<{ queue_name: string; job_id: string; payload: unknown }>`
            select queue_name, job_id, payload from durable.outbox where queue_name like 'test.%' order by queue_name, id`.execute(db());

        return rows;
    }

    describe('publish', () => {

        it('adds a message for each listener, in the publisher\'s transaction', async () => {
            await domain.happen(SERVICE, [{ n: 1, eventId: 'e1' }]);

            expect(await getOutbox()).toEqual([
                { queue_name: ListenerA.name, job_id: 'e1', payload: { n: 1 } },
                { queue_name: ListenerB.name, job_id: 'e1', payload: { n: 1 } },
            ]);
        });

        it('rolls back with it: no change, no event', async () => {
            await expect(domain.happen(SERVICE, [{ n: 1, eventId: 'e1' }], true)).rejects.toThrow();

            expect(await getOutbox()).toEqual([]);
        });

        it('adds nothing for a topic nobody listens to', async () => {
            await domain.happenUnheard(SERVICE, 'e1');

            const { rows } = await sql<{ n: number }>`select count(*)::int as n from durable.outbox where job_id = 'e1'`.execute(db());

            expect(rows[0].n).toBe(0);
        });

        it('works in a user\'s transaction (users may publish, never read who listens)', async () => {
            await domain.happen(user, [{ n: 1, eventId: 'e1' }]);

            expect(await getOutbox()).toHaveLength(2);
        });

        it('refuses to run outside a transaction — that would be a dual write again', async () => {
            await expect(testEvent.publish([{ payload: { n: 1 }, eventId: 'e1' }])).rejects.toThrow(/No open transaction/);
        });

        it('ignores an event id a listener hasn\'t acked yet', async () => {
            await domain.happen(SERVICE, [{ n: 1, eventId: 'e1' }]);
            await domain.happen(SERVICE, [{ n: 2, eventId: 'e1' }]);

            expect(await getOutbox()).toHaveLength(2);
        });

        it('checks the payload against the event\'s schema', async () => {
            await expect(domain.happen(SERVICE, [{ n: 1.5, eventId: 'e1' }])).rejects.toThrow();
        });
    });

    describe('relay', () => {

        it('sends each listener its message, after the commit', async () => {
            await domain.happen(SERVICE, [{ n: 1, eventId: 'e1' }, { n: 2, eventId: 'e2' }]);

            expect(await testEvent.relay()).toBe(4);
            expect((await redisA.getJob('e1'))?.data).toEqual({ n: 1 });
            expect((await redisB.getJob('e2'))?.data).toEqual({ n: 2 });
        });

        it('needs no listener registered in the publisher\'s process', async () => {
            await domain.happen(SERVICE, [{ n: 1, eventId: 'e1' }]);

            await testEvent.relay();

            expect(durableQueues.get(ListenerB.name)).toBeUndefined();
            expect((await redisB.getJob('e1'))?.data).toEqual({ n: 1 });
        });
    });

    describe('ack', () => {

        it('a listener\'s take acks its own message — the other listener\'s stays', async () => {
            await domain.happen(SERVICE, [{ n: 1, eventId: 'e1' }]);

            await domain.takeAsA(SERVICE, ['e1']);

            expect((await getOutbox()).map((row) => row.queue_name)).toEqual([ListenerB.name]);
        });

        it('acks through the internal API, for a listener without a take step', async () => {
            await domain.happen(SERVICE, [{ n: 1, eventId: 'e1' }]);

            await harness.get(DurableQueueInternalController).ack(ListenerA.name, { jobId: 'e1' });

            expect((await getOutbox()).map((row) => row.queue_name)).toEqual([ListenerB.name]);
        });
    });
});
