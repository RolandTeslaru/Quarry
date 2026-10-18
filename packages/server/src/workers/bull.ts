import { BullModule } from '@nestjs/bullmq';
import type { Foundations } from '@quarry/shared/domain';
import { QUEUE_PREFIX, redisConnection } from '@/infra/redis';

/** BullMQ connection for a worker process (read lazily, after env is loaded). */
export const BullRoot = BullModule.forRootAsync({
    useFactory: () => ({ connection: redisConnection(), prefix: QUEUE_PREFIX }),
});

/** Registers the queues this worker consumes — one per @Processor it provides. */
export const consumes = (...queues: Foundations.Queue.Definition[]) =>
    BullModule.registerQueue(...queues.map((queue) => ({ name: queue.name })));
