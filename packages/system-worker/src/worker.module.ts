import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Catalog, CodeWorkspace, DataConnection, Forge } from '@quarry/shared/domain';
import { QUEUE_PREFIX, redisConnection } from '@quarry/shared/server/redis';
import { ForgeRelaySweepProcessor } from './processors/forge-relay-sweep.processor';
import { CodeWorkspaceCheckSweepProcessor } from './processors/code-workspace-check-sweep.processor';
import { OutboxRelayProcessor } from './processors/outbox-relay.processor';
import { StorageGcProcessor } from './processors/storage-gc.processor';
import { SyncReaperProcessor } from './processors/sync-reaper.processor';
import { Schedules } from './schedules';

/** For container probes: up, and able to reach Redis (where its schedules and jobs live). */
@Controller('health')
export class HealthController {

    constructor(@InjectQueue(Catalog.Queue.OutboxRelay.Definition.name) private readonly queue: Queue) {}

    @Get()
    async health() {
        try {
            // ioredis under BullMQ's client type. BullMQ needs maxRetriesPerRequest: null, so a dead Redis
            // would hang the command forever — the probe gives up after a second instead.
            const redis = (await this.queue.client) as unknown as { ping(): Promise<string> };

            await Promise.race([redis.ping(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1_000))]);
        }
        catch {
            throw new ServiceUnavailableException({ ok: false, worker: 'system', redis: 'down' });
        }

        return { ok: true, worker: 'system', redis: 'up' };
    }
}

/**
 * The system worker: housekeeping on a schedule — outbox relay, storage GC,
 * stuck-run reaper, sync schedule reconcile, Forge's relay sweep, Code Workspaces'
 * check sweep. No database: each job's Postgres
 * part is a server /internal endpoint.
 */
@Module({
    imports: [
        BullModule.forRootAsync({ useFactory: () => ({ connection: redisConnection(), prefix: QUEUE_PREFIX }) }),
        BullModule.registerQueue(
            { name: Catalog.Queue.OutboxRelay.Definition.name },
            { name: Catalog.Queue.StorageGc.Definition.name },
            { name: Catalog.Queue.DatasetUpdated.Definition.name },          // produced: relayed outbox events
            { name: DataConnection.Queue.SyncReaper.Definition.name },
            { name: DataConnection.Queue.Sync.Definition.name },             // produced: cron schedulers only
            { name: Forge.Queue.RelaySweep.Definition.name },
            { name: CodeWorkspace.Queue.CheckSweep.Definition.name },
        ),
    ],
    controllers: [HealthController],
    providers:   [OutboxRelayProcessor, StorageGcProcessor, SyncReaperProcessor, ForgeRelaySweepProcessor, CodeWorkspaceCheckSweepProcessor, Schedules],
})
export class WorkerModule {}
