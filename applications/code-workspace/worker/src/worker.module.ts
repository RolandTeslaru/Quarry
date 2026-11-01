import { BullModule } from '@nestjs/bullmq';
import { Controller, Get, Module } from '@nestjs/common';
import { CodeWorkspace } from '@quarry/shared/domain';
import { QUEUE_PREFIX, redisConnection } from '@quarry/shared/server/redis';
import { CheckRunner } from './check-runner';
import { DockerDriver } from './docker-driver';
import { SessionController } from './http/session.controller';
import { RunCheckProcessor } from './run-check.processor';
import { SessionManager } from './session-manager';

import CI = CodeWorkspace.CI;

/** For container probes: the worker's API is up. */
@Controller('health')
export class HealthController {

    @Get()
    public health() {
        return { ok: true, worker: 'code-workspace' };
    }
}

/**
 * The code workspace worker: its API for the server (/sessions) and the IDE
 * proxy, on its own port (main.ts), and check runs taken from Redis
 * (code-workspace.run-check). The only process that talks to Docker; no
 * database — the server's /internal API mints each session's credential and
 * records each check run.
 */
@Module({
    imports: [
        BullModule.forRootAsync({ useFactory: () => ({ connection: redisConnection(), prefix: QUEUE_PREFIX }) }),
        BullModule.registerQueue({ name: CI.Queue.RunCheck.Definition.name }),
    ],
    controllers: [HealthController, SessionController],
    providers:   [DockerDriver, SessionManager, CheckRunner, RunCheckProcessor],
})
export class WorkerModule {}
