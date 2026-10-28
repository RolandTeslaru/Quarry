import { NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Foundations } from '@quarry/shared/domain';
import { QUEUE_PREFIX, redisConnection } from '@quarry/shared/server/redis';
import { Principal } from '@/auth/principal';
import { db } from '@/db/pool';
import { Repository, Transactional } from '@/db/repository';
import { DurableQueueHandle, DurableQueueInternalController, DurableQueues } from '@/infra/durable-queue';
import { OutboxDB } from '@/infra/durable-queue/outbox.db';
import { OutboxRepository } from '@/infra/durable-queue/outbox.repository';
import { QueueManager } from '@/infra/queue';
import { ForgeHarness } from '../support/forge-fixtures';

const TestQueue = Foundations.Queue.define({
    name:    'test.durable',
    job:     z.object({ n: z.number().int() }),
    result:  z.object({}),
    options: { removeOnComplete: true, removeOnFail: true },
});

const TestDurableQueue = Foundations.DurableQueue.define({ queue: TestQueue, staleSentMinutes: 2 });

const SERVICE = Principal.SELF('test');

/** A domain's repository, reduced to the part that matters: adding and acking inside its own transactions. */
class TestDomainRepository extends Repository(OutboxDB.database) {

    constructor(private readonly testQueue: DurableQueueHandle<typeof TestQueue>) {
        super();
    }

    @Transactional()
    public async schedule(principal: Principal, jobs: { n: number; jobId: string }[], fail = false): Promise<void> {
        await this.testQueue.add(jobs.map(({ n, jobId }) => ({ message: { n }, jobId })));

        if (fail)
            throw new Error('the domain change failed');
    }

    @Transactional()
    public async take(principal: Principal, jobIds: string[], fail = false): Promise<void> {
        await this.testQueue.ack(jobIds);

        if (fail)
            throw new Error('the take failed');
    }
}

/**
 * Durable queues (docs/design/durable-queues.md): add joins the domain's transaction,
 * the relay sends then marks, the sweep sends again what's unsent or stale, the ack
 * ends it. Over a throwaway queue, `test.durable`, read from the test Redis.
 */
describe('durable queues', () => {

    let harness: ForgeHarness;
    let durableQueues: DurableQueues;
    let handle: DurableQueueHandle<typeof TestQueue>;
    let domain: TestDomainRepository;
    let user: Principal.User;
    const redis = new Queue(TestQueue.name, { connection: redisConnection(), prefix: QUEUE_PREFIX });

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        durableQueues = harness.get(DurableQueues);
        durableQueues.register(TestDurableQueue);
        handle = new DurableQueueHandle(TestDurableQueue, harness.get(OutboxRepository), durableQueues);
        domain = new TestDomainRepository(handle);
        user = await harness.createUser('member');
    });

    beforeEach(async () => {
        vi.restoreAllMocks();
        await redis.obliterate({ force: true });
        await sql`delete from foundations.outbox where queue_name like 'test.%'`.execute(db());
    });

    afterAll(async () => {
        await redis.close();
        await harness.stop();
    });

    async function getOutbox(): Promise<{ job_id: string; sent_at: Date | null; sends: number }[]> {
        const { rows } = await sql<{ job_id: string; sent_at: Date | null; sends: number }>`
            select job_id, sent_at, sends from foundations.outbox where queue_name = ${TestQueue.name} order by id`.execute(db());

        return rows;
    }

    async function getWaiting(): Promise<string[]> {
        return (await redis.getJobs(['waiting'], 0, -1, true)).map((job) => job.id!);
    }

    async function backdateSent(jobId: string, minutes: number): Promise<void> {
        await sql`update foundations.outbox set sent_at = now() - make_interval(mins => ${minutes}) where queue_name = ${TestQueue.name} and job_id = ${jobId}`.execute(db());
    }

    describe('add', () => {

        it('writes the message in the domain\'s transaction — unsent', async () => {
            await domain.schedule(SERVICE, [{ n: 1, jobId: 'a' }]);

            expect(await getOutbox()).toEqual([{ job_id: 'a', sent_at: null, sends: 0 }]);
        });

        it('rolls back with it: no change, no message', async () => {
            await expect(domain.schedule(SERVICE, [{ n: 1, jobId: 'a' }], true)).rejects.toThrow();

            expect(await getOutbox()).toEqual([]);
        });

        it('works in a user\'s transaction (row-level security: users may append)', async () => {
            await domain.schedule(user, [{ n: 1, jobId: 'a' }]);

            expect(await getOutbox()).toHaveLength(1);
        });

        it('refuses to run outside a transaction — that would be a dual write again', async () => {
            await expect(handle.add([{ message: { n: 1 }, jobId: 'a' }])).rejects.toThrow(/No open transaction/);
        });

        it('ignores a job id already in the outbox', async () => {
            await domain.schedule(SERVICE, [{ n: 1, jobId: 'a' }]);
            await domain.schedule(SERVICE, [{ n: 2, jobId: 'a' }]);

            expect(await getOutbox()).toHaveLength(1);
        });

        it('checks the message against the queue\'s job schema', async () => {
            await expect(domain.schedule(SERVICE, [{ n: 1.5, jobId: 'a' }])).rejects.toThrow();
        });
    });

    describe('relay', () => {

        it('sends unsent messages, oldest first, then marks them sent', async () => {
            await domain.schedule(SERVICE, [{ n: 1, jobId: 'a' }, { n: 2, jobId: 'b' }]);

            expect(await handle.relay()).toBe(2);
            expect(await getWaiting()).toEqual(['a', 'b']);
            expect((await redis.getJob('a'))?.data).toEqual({ n: 1 });

            const outbox = await getOutbox();

            expect(outbox.map((row) => row.sends)).toEqual([1, 1]);
            expect(outbox.every((row) => row.sent_at !== null)).toBe(true);
        });

        it('leaves sent messages to the sweep', async () => {
            await domain.schedule(SERVICE, [{ n: 1, jobId: 'a' }]);
            await handle.relay();

            expect(await handle.relay()).toBe(0);
        });

        it('keeps them unsent when Redis refuses, and never throws', async () => {
            await domain.schedule(SERVICE, [{ n: 1, jobId: 'a' }, { n: 2, jobId: 'b' }]);
            vi.spyOn(harness.get(QueueManager), 'add').mockRejectedValueOnce(new Error('Connection is closed'));

            expect(await handle.relay()).toBe(0);
            expect((await getOutbox()).map((row) => row.sent_at)).toEqual([null, null]);
            expect(await handle.relay()).toBe(2);
        });

        it('doesn\'t duplicate a message already in Redis (crashed between sending and marking)', async () => {
            await domain.schedule(SERVICE, [{ n: 1, jobId: 'a' }]);
            await handle.relay();
            await sql`update foundations.outbox set sent_at = null where job_id = 'a' and queue_name = ${TestQueue.name}`.execute(db());

            await handle.relay();

            expect(await getWaiting()).toEqual(['a']);
        });
    });

    describe('sweep', () => {

        it('sends what was never sent', async () => {
            await domain.schedule(SERVICE, [{ n: 1, jobId: 'a' }]);

            expect(await durableQueues.sweep()).toBeGreaterThanOrEqual(1);
            expect(await getWaiting()).toEqual(['a']);
        });

        it('sends again a message sent over staleSentMinutes ago and not acked — Redis lost it', async () => {
            await domain.schedule(SERVICE, [{ n: 1, jobId: 'a' }]);
            await handle.relay();
            await redis.remove('a');                                                  // a Redis restart
            await backdateSent('a', 3);

            await durableQueues.sweep();

            expect(await getWaiting()).toEqual(['a']);
            expect((await getOutbox())[0].sends).toBe(2);
        });

        it('doesn\'t duplicate a stale message still waiting (every consumer busy)', async () => {
            await domain.schedule(SERVICE, [{ n: 1, jobId: 'a' }]);
            await handle.relay();
            await backdateSent('a', 3);

            await durableQueues.sweep();

            expect(await getWaiting()).toEqual(['a']);
        });

        it('leaves a message sent moments ago alone', async () => {
            await domain.schedule(SERVICE, [{ n: 1, jobId: 'a' }]);
            await handle.relay();
            await redis.remove('a');

            await durableQueues.sweep();

            expect(await getWaiting()).toEqual([]);
            expect((await getOutbox())[0].sends).toBe(1);
        });

        it('leaves messages of a queue nobody registered in place', async () => {
            await sql`insert into foundations.outbox (queue_name, job_id, payload) values ('test.unregistered', 'x', '{}')`.execute(db());

            await durableQueues.sweep();

            const { rows } = await sql<{ n: number }>`select count(*)::int as n from foundations.outbox where queue_name = 'test.unregistered'`.execute(db());

            expect(rows[0].n).toBe(1);
        });
    });

    describe('ack', () => {

        it('deletes the message in the transaction that takes the work', async () => {
            await domain.schedule(SERVICE, [{ n: 1, jobId: 'a' }, { n: 2, jobId: 'b' }]);

            await domain.take(SERVICE, ['a']);

            expect((await getOutbox()).map((row) => row.job_id)).toEqual(['b']);
        });

        it('rolls back with it: the message stays, and will be sent again', async () => {
            await domain.schedule(SERVICE, [{ n: 1, jobId: 'a' }]);

            await expect(domain.take(SERVICE, ['a'], true)).rejects.toThrow();

            expect(await getOutbox()).toHaveLength(1);
        });

        it('works in a user\'s transaction (a user cancels)', async () => {
            await domain.schedule(SERVICE, [{ n: 1, jobId: 'a' }]);

            await domain.take(user, ['a']);

            expect(await getOutbox()).toEqual([]);
        });

        it('stops the sweep sending it', async () => {
            await domain.schedule(SERVICE, [{ n: 1, jobId: 'a' }]);
            await handle.relay();
            await redis.remove('a');
            await backdateSent('a', 3);
            await domain.take(SERVICE, ['a']);

            await durableQueues.sweep();

            expect(await getWaiting()).toEqual([]);
        });

        it('acks through the internal API, for consumers without a take step', async () => {
            const controller = harness.get(DurableQueueInternalController);

            await domain.schedule(SERVICE, [{ n: 1, jobId: 'a' }]);
            await controller.ack(TestQueue.name, { jobId: 'a' });

            expect(await getOutbox()).toEqual([]);
            await expect(controller.ack(Foundations.Queue.Name.parse('test.unregistered'), { jobId: 'a' })).rejects.toBeInstanceOf(NotFoundException);
        });
    });
});
