import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { DataConnection } from '@quarry/shared/domain';
import { DuckDb, QUEUE_PREFIX, redisConnection, SourceRuntimes } from './infra';
import { SourceProbeProcessor, SyncProcessor } from './processors';

/** For container probes: up, and able to reach Redis (where its jobs come from). */
@Controller('health')
export class HealthController {

    constructor(@InjectQueue(DataConnection.Queue.Sync.Definition.name) private readonly queue: Queue) {}

    @Get()
    async health() {
        try {
            // ioredis under BullMQ's client type. BullMQ needs maxRetriesPerRequest: null, so a dead Redis
            // would hang the command forever — the probe gives up after a second instead.
            const redis = (await this.queue.client) as unknown as { ping(): Promise<string> };

            await Promise.race([redis.ping(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1_000))]);
        }
        catch {
            throw new ServiceUnavailableException({ ok: false, worker: 'data-connection', redis: 'down' });
        }

        return { ok: true, worker: 'data-connection', redis: 'up' };
    }
}

/**
 * The Data Connection worker: consumes data-connection.sync and
 * data-connection.source-probe. The only process that reaches source systems
 * and resolves their credentials; no database — the server's /internal API
 * does every Postgres write.
 */
@Module({
    imports: [
        BullModule.forRootAsync({ useFactory: () => ({ connection: redisConnection(), prefix: QUEUE_PREFIX }) }),
        BullModule.registerQueue(
            { name: DataConnection.Queue.Sync.Definition.name },
            { name: DataConnection.Queue.SourceProbe.Definition.name },
        ),
    ],
    controllers: [HealthController],
    providers:   [DuckDb, SourceRuntimes, SyncProcessor, SourceProbeProcessor],
})
export class WorkerModule {}
