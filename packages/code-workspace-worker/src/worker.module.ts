import { Controller, Get, Module } from '@nestjs/common';
import { DockerDriver } from './docker-driver';
import { SessionController } from './http/session.controller';
import { SessionManager } from './session-manager';

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
 * proxy, on its own port (main.ts). The only process that talks to Docker;
 * no database — the server's /internal API mints each session's credential.
 */
@Module({
    controllers: [HealthController, SessionController],
    providers:   [DockerDriver, SessionManager],
})
export class WorkerModule {}
