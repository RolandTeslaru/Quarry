import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { WorkerHost } from '@nestjs/bullmq';
import { Queue, QueueEvents, type Job, type JobsOptions, type RepeatOptions } from 'bullmq';
import { Foundations } from '@quarry/shared/domain';
import { QUEUE_PREFIX, closeSharedRedis, redisConnection, sharedRedis } from './redis';

/**
 * The BullMQ runtime for queues declared with `Foundations.Queue.define` in
 * each service's `<service>.queue.ts`. See docs/design/jobs.md.
 */
type Definition = Foundations.Queue.Definition;
type InputOf<Q extends Definition>  = Foundations.Queue.InputOf<Q>;
type JobOf<Q extends Definition>    = Foundations.Queue.JobOf<Q>;
type ResultOf<Q extends Definition> = Foundations.Queue.ResultOf<Q>;

/**
 * The only way code enqueues. Payloads are validated on the way in; the
 * processor validates them again on the way out (JobProcessor).
 */
@Injectable()
export class QueueManager implements OnModuleDestroy {

    private readonly queues = new Map<Foundations.Queue.Name, Queue>();
    private readonly events = new Map<Foundations.Queue.Name, QueueEvents>();

    async add<Q extends Definition>(definition: Q, data: InputOf<Q>, options?: JobsOptions): Promise<Job> {
        return this.ensure(definition).add(definition.name, definition.job.parse(data), options);
    }

    /** Request/reply: enqueue, wait for the processor's result, validate it. */
    async request<Q extends Definition>(definition: Q, data: InputOf<Q>, timeoutMs: number): Promise<ResultOf<Q>> {
        const job = await this.add(definition, data);
        const result: unknown = await job.waitUntilFinished(this.ensureEvents(definition), timeoutMs);

        return definition.result.parse(result) as ResultOf<Q>;
    }

    /** Cron or interval schedule that enqueues `data` — idempotent per scheduler id. */
    async upsertScheduler<Q extends Definition>(
        definition: Q, schedulerId: string, repeat: Omit<RepeatOptions, 'key'>, data: InputOf<Q>,
    ): Promise<void> {
        await this.ensure(definition).upsertJobScheduler(schedulerId, repeat, {
            name: definition.name,
            data: definition.job.parse(data),
            opts: definition.options,
        });
    }

    async removeScheduler(definition: Definition, schedulerId: string): Promise<void> {
        await this.ensure(definition).removeJobScheduler(schedulerId);
    }

    async schedulerIds(definition: Definition): Promise<string[]> {
        const schedulers = await this.ensure(definition).getJobSchedulers();

        return schedulers.map((scheduler) => scheduler.key);
    }

    async onModuleDestroy(): Promise<void> {
        await Promise.all([...this.events.values()].map((events) => events.close()));
        await Promise.all([...this.queues.values()].map((queue) => queue.close()));
        await closeSharedRedis();
    }

    /** The BullMQ client for this queue — created on first use, then reused (one per name per process). */
    private ensure(definition: Definition): Queue {
        let queue = this.queues.get(definition.name);

        if (!queue) {
            queue = new Queue(definition.name, {
                connection:        sharedRedis(),            // one client for all producer queues
                prefix:            QUEUE_PREFIX,
                defaultJobOptions: definition.options,
            });
            this.queues.set(definition.name, queue);
        }

        return queue;
    }

    /** The event listener for this queue (request/reply only) — created on first use, then reused. Own connection: it blocks. */
    private ensureEvents(definition: Definition): QueueEvents {
        let events = this.events.get(definition.name);

        if (!events) {
            events = new QueueEvents(definition.name, { connection: redisConnection(), prefix: QUEUE_PREFIX });
            this.events.set(definition.name, events);
        }

        return events;
    }
}

/**
 * Base for processors: Redis data is untyped and a deploy can leave old-shaped
 * jobs behind, so `job.data` is parsed before `handle` sees it, and the result
 * is parsed before BullMQ stores it.
 */
export abstract class JobProcessor<Q extends Definition> extends WorkerHost {

    protected abstract readonly definition: Q;

    protected abstract handle(job: JobOf<Q>, raw: Job): Promise<ResultOf<Q>>;

    async process(raw: Job): Promise<ResultOf<Q>> {
        const job = this.definition.job.parse(raw.data) as JobOf<Q>;

        return this.definition.result.parse(await this.handle(job, raw)) as ResultOf<Q>;
    }
}
