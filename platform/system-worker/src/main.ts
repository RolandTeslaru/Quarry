// load-env first: reflect-metadata and the env every other module reads.
import './load-env';
import { waitForServer } from '@quarry/shared/server/internal-api';
import { NestFactory } from '@nestjs/core';
import { System } from '@quarry/shared/server/system';
import { WorkerModule } from './worker.module';

System.log.setAppName('SystemWorker');

const log = System.log.withContext('Worker');

async function bootstrap(): Promise<void> {
    // Started alongside the server, it may come up first — every job needs the server's /internal API.
    await waitForServer();

    const app = await NestFactory.create(WorkerModule);

    app.enableShutdownHooks();

    const port = Number(process.env.WORKER_PORT ?? 4102);

    await app.listen(port);

    log.info('System worker listening', { port });
}

bootstrap().catch((error: unknown) => {
    log.error('System worker boot failed', { error });
    process.exit(1);
});
