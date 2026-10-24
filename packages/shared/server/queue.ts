/// <reference types="node" />
import { WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type { Foundations } from '../domain';
import { System } from './system';

/**
 * Base for a worker's @Processor classes, consuming a queue declared in
 * @quarry/shared: Redis data is untyped and a deploy can leave old-shaped jobs
 * behind, so the job is parsed before `handle` sees it, and the result before
 * BullMQ stores it. A failure is logged here — BullMQ only marks the job failed.
 */
export abstract class JobProcessor<Q extends Foundations.Queue.Definition> extends WorkerHost {
    protected abstract readonly definition: Q;
    protected abstract handle(job: Foundations.Queue.JobOf<Q>, raw: Job): Promise<Foundations.Queue.ResultOf<Q>>;

    async process(raw: Job): Promise<Foundations.Queue.ResultOf<Q>> {
        const log = System.log.withContext(this.definition.name);
        const startedAt = performance.now();
        const meta = { jobId: raw.id, job: raw.name, attempt: raw.attemptsMade + 1 };

        // Handling a job isn't its outcome — the processor logs that. These lines are for tracing: LOG_LEVEL=debug.
        log.debug('Job received', meta);

        try {
            const job = this.definition.job.parse(raw.data) as Foundations.Queue.JobOf<Q>;
            const result = this.definition.result.parse(await this.handle(job, raw)) as Foundations.Queue.ResultOf<Q>;

            log.debug('Job handled', { ...meta, ms: performance.now() - startedAt });

            return result;
        }
        catch (error) {
            log.error('Job failed', {
                ...meta,
                error: error instanceof Error ? error.message : String(error),
                ms:    performance.now() - startedAt,
            });

            throw error;
        }
    }
}
