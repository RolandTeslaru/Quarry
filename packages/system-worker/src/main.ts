// infra first: reflect-metadata and the env every other module reads.
import { waitForServer } from './infra';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
    // Started alongside the server, it may come up first — every job needs the server's /internal API.
    await waitForServer();

    const app = await NestFactory.create(WorkerModule);

    app.enableShutdownHooks();

    const port = Number(process.env.WORKER_PORT ?? 4102);

    await app.listen(port);

    console.log(`Quarry system worker running (health on :${port}/health)`);
}

bootstrap().catch((error: unknown) => {
    console.error('System worker boot failed:', error);
    process.exit(1);
});
