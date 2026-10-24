import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { CodeWorkspace } from '@quarry/shared/domain';
import { DockerDriver } from './docker-driver';
import { QUEUE_PREFIX, redisConnection } from '@quarry/shared/server/redis';
import { SessionProcessor } from './processors';
import { SessionManager } from './session-manager';

/** For container probes: up, and able to reach Redis (where its jobs come from). */
@Controller('health')
export class HealthController {

    constructor(@InjectQueue(CodeWorkspace.Queue.Session.Definition.name) private readonly queue: Queue) {}

    @Get()
    async health() {
        try {
            // ioredis under BullMQ's client type; a dead Redis would hang the command — the probe gives up after a second.
            const redis = (await this.queue.client) as unknown as { ping(): Promise<string> };

            await Promise.race([redis.ping(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1_000))]);
        }
        catch {
            throw new ServiceUnavailableException({ ok: false, worker: 'code-workspace', redis: 'down' });
        }

        return { ok: true, worker: 'code-workspace', redis: 'up' };
    }
}

/**
 * The code workspace worker: consumes code-workspace.session and serves the IDE gateway (main.ts).
 * The only process that talks to Docker; no database — the server's /internal
 * API mints each session's credential.
 */
@Module({
    imports: [
        BullModule.forRootAsync({ useFactory: () => ({ connection: redisConnection(), prefix: QUEUE_PREFIX }) }),
        BullModule.registerQueue({ name: CodeWorkspace.Queue.Session.Definition.name }),
    ],
    controllers: [HealthController],
    providers:   [DockerDriver, SessionManager, SessionProcessor],
})
export class WorkerModule {}
