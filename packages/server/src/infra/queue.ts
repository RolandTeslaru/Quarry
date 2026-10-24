import { HttpException, HttpStatus, Injectable, ServiceUnavailableException, type OnModuleDestroy } from '@nestjs/common';
import { Queue, QueueEvents, type Job, type JobsOptions, type RepeatOptions } from 'bullmq';
import { Foundations } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { QUEUE_PREFIX, closeSharedRedis, redisConnection, sharedRedis } from './redis';

/**
 * The BullMQ runtime for queues declared with `Foundations.Queue.define` in
 * each service's `<service>.queue.ts`. See docs/design/jobs.md.
 */
type Definition = Foundations.Queue.Definition;
type InputOf<Q extends Definition>  = Foundations.Queue.InputOf<Q>;
type ResultOf<Q extends Definition> = Foundations.Queue.ResultOf<Q>;

const log = System.log.withContext('Queue');

/**
 * A request/reply job got no answer in time. A 503 if nobody catches it — the
 * message says why; a service that wants to handle it differently catches it
 * (`instanceof QueueTimeoutError`).
 */
export class QueueTimeoutError extends ServiceUnavailableException {

    constructor(
        readonly queue:     Foundations.Queue.Name,
        readonly jobId:     string | undefined,
        /** `waiting`: no worker picked it up. `active`: a worker took it but didn't finish. */
        readonly state:     'waiting' | 'active',
        readonly timeoutMs: number,
    ) {
        const seconds = Math.round(timeoutMs / 1000);

        super(state === 'waiting'
            ? `No worker picked up ${queue} within ${seconds} s — is its worker running?`
            : `The ${queue} worker didn't finish within ${seconds} s`);
    }
}

/**
 * A request/reply job ran and failed: the worker's own reason, as a 424 (Failed
 * Dependency) — what the server depended on failed, not the server. Without
 * it Nest answers a bare 500 and the reason is lost. (Not 502: the frontend
 * retries those.)
 */
export class QueueJobError extends HttpException {

    constructor(
        readonly queue: Foundations.Queue.Name,
        readonly jobId: string | undefined,
        reason:         string,
    ) {
        super(reason.trim(), HttpStatus.FAILED_DEPENDENCY);
    }
}

/**
 * The only way the server enqueues. Payloads are validated on the way in; the
 * workers (their own packages) validate them again when they consume.
 */
@Injectable()
export class QueueManager implements OnModuleDestroy {

    private readonly queues = new Map<Foundations.Queue.Name, Queue>();
    private readonly events = new Map<Foundations.Queue.Name, QueueEvents>();

    async add<Q extends Definition>(definition: Q, data: InputOf<Q>, options?: JobsOptions): Promise<Job> {
        return this.ensure(definition).add(definition.name, definition.job.parse(data), options);
    }

    /**
     * Request/reply: enqueue, wait for the processor's result, validate it. No
     * answer in time → logged, then a QueueTimeoutError; a job left waiting (no
     * worker picked it up) is removed, so it doesn't run later for nobody. A
     * failed job → a QueueJobError with the worker's reason.
     */
    async request<Q extends Definition>(definition: Q, data: InputOf<Q>, timeoutMs: number): Promise<ResultOf<Q>> {
        const job = await this.add(definition, data);
        let result: unknown;

        try {
            result = await job.waitUntilFinished(this.ensureEvents(definition), timeoutMs);
        }
        catch (error) {
            throw await this.timeoutOr(job, definition.name, timeoutMs, error);
        }

        return definition.result.parse(result) as ResultOf<Q>;
    }

    /**
     * `request` for a queue whose jobs and results are unions on `op` (one
     * processor, several operations): the result typed as the job's op's. The
     * processor answers each op with the same op — its contract, not checked here.
     */
    async requestOp<Q extends Definition, const J extends InputOf<Q> & { op: string }>(
        definition: Q,
        data:       J,
        timeoutMs:  number,
    ): Promise<Extract<ResultOf<Q>, { op: J['op'] }>> {
        return await this.request(definition, data, timeoutMs) as Extract<ResultOf<Q>, { op: J['op'] }>;
    }

    /** After a failed wait: a QueueTimeoutError if the job never finished (asked of BullMQ, not read from the message), else a QueueJobError with its reason. */
    private async timeoutOr(job: Job, queue: Foundations.Queue.Name, timeoutMs: number, error: unknown): Promise<unknown> {
        const state = await job.getState();

        if (state !== 'waiting' && state !== 'prioritized' && state !== 'delayed' && state !== 'active')
            return new QueueJobError(queue, job.id, error instanceof Error ? error.message : String(error));

        const waiting = state !== 'active';

        if (waiting)
            await job.remove().catch(() => undefined);                          // a worker may have taken it this instant

        log.error(waiting ? 'No worker picked up a request' : 'A worker did not finish a request in time', {
            queue,
            jobId: job.id,
            state,
            timeoutMs,
        });

        return new QueueTimeoutError(queue, job.id, waiting ? 'waiting' : 'active', timeoutMs);
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
