import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Forge } from '@quarry/shared/domain';
import { QUEUE_PREFIX, redisConnection } from '@quarry/shared/server/redis';
import { RunJobProcessor } from './run-job.processor';

/** For container probes: up, and able to reach Redis (where its jobs come from). */
@Controller('health')
export class HealthController {

    constructor(@InjectQueue(Forge.Queue.RunJob.Definition.name) private readonly queue: Queue) {}

    @Get()
    public async health() {
        try {
            // ioredis under BullMQ's client type; a dead Redis would hang the command, so the probe gives up after a second.
            const redis = (await this.queue.client) as unknown as { ping(): Promise<string> };

            await Promise.race([redis.ping(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1_000))]);
        }
        catch {
            throw new ServiceUnavailableException({ ok: false, agent: 'forge', redis: 'down' });
        }

        return { ok: true, agent: 'forge', redis: 'up' };
    }
}

/**
 * The ForgeAgent: consumes forge.run-job and reports to the server's ForgeAgent
 * API. No database — the server does every Postgres write.
 */
@Module({
    imports: [
        BullModule.forRootAsync({ useFactory: () => ({ connection: redisConnection(), prefix: QUEUE_PREFIX }) }),
        BullModule.registerQueue({ name: Forge.Queue.RunJob.Definition.name }),
    ],
    controllers: [HealthController],
    providers:   [RunJobProcessor],
})
export class AgentModule {}
