// load-env first: reflect-metadata and the env every other module reads.
import './load-env';
import { waitForServer } from '@quarry/shared/server/internal-api';
import { NestFactory } from '@nestjs/core';
import { Encryption } from '@quarry/shared/server/encryption';
import { System } from '@quarry/shared/server/system';
import { WorkerModule } from './worker.module';

System.log.setAppName('DataConnectionWorker');

const log = System.log.withContext('Worker');

async function bootstrap(): Promise<void> {
    // Credentials arrive encrypted; without the workspace key no run could start — fail now, not on the first job.
    Encryption.assertConfigured();

    // Started alongside the server, it may come up first — runs need the server's /internal API.
    await waitForServer();

    const app = await NestFactory.create(WorkerModule);

    app.enableShutdownHooks();                      // finish or release the current job on stop

    const port = Number(process.env.WORKER_PORT ?? 4101);

    await app.listen(port);

    log.info('Data Connection worker listening', { port });
}

bootstrap().catch((error: unknown) => {
    log.error('Data Connection worker boot failed', { error });
    process.exit(1);
});
