// load-env first: reflect-metadata and the env every other module reads.
import './load-env';
import { waitForServer } from '@quarry/shared/server/internal-api';
import { NestFactory } from '@nestjs/core';
import { config } from './config';
import { System } from '@quarry/shared/server/system';
import { createGateway } from './gateway';
import { WorkerExceptionFilter } from './http/worker-exception.filter';
import { SessionManager } from './session-manager';
import { WorkerModule } from './worker.module';

System.log.setAppName('CodeWorkspaceWorker');

const log = System.log.withContext('Worker');

async function bootstrap(): Promise<void> {
    // Session credentials come from the server's /internal API.
    await waitForServer();

    const app = await NestFactory.create(WorkerModule);

    app.useGlobalFilters(new WorkerExceptionFilter());
    app.enableShutdownHooks();

    await app.listen(config.port);

    // Its own server and port: the only one browsers reach, and it streams the IDE's bodies through untouched.
    const gateway = createGateway(app.get(SessionManager)).listen(config.gatewayPort);

    app.getHttpServer().on('close', () => gateway.close());

    log.info('Code workspace worker listening', { port: config.port, gatewayPort: config.gatewayPort });
}

bootstrap().catch((error: unknown) => {
    log.error('Code workspace worker boot failed', { error });
    process.exit(1);
});
