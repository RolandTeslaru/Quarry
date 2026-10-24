// load-env first: reflect-metadata and the env every other module reads.
import './load-env';
import { waitForServer } from '@quarry/shared/server/internal-api';
import type { Server } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { config } from './config';
import { System } from '@quarry/shared/server/system';
import { attachGateway } from './gateway';
import { SessionManager } from './session-manager';
import { WorkerModule } from './worker.module';

System.log.setAppName('CodeWorkspaceWorker');

const log = System.log.withContext('Worker');

async function bootstrap(): Promise<void> {
    // Session credentials come from the server's /internal API.
    await waitForServer();

    // No body parsing: the gateway streams the IDE's request bodies through untouched.
    const app = await NestFactory.create(WorkerModule, { bodyParser: false });

    app.use(attachGateway(app.getHttpServer() as Server, app.get(SessionManager)));
    app.enableShutdownHooks();

    await app.listen(config.port);

    log.info('Code workspace worker listening', { port: config.port });
}

bootstrap().catch((error: unknown) => {
    log.error('Code workspace worker boot failed', { error });
    process.exit(1);
});
