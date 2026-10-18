// Must stay first: reflect-metadata and env before anything else loads.
import '../load-env';

import { NestFactory } from '@nestjs/core';
import { db } from '@/db/pool';
import { waitForMigrations } from '@/db/migrator';
import { SystemWorkerModule } from './system-worker.module';

async function bootstrap(): Promise<void> {
    // The API migrates; a worker started alongside it waits until it has.
    await waitForMigrations(db());

    // NestJS without the HTTP server: DI, modules, lifecycle hooks, @nestjs/bullmq processors.
    const app = await NestFactory.createApplicationContext(SystemWorkerModule);

    app.enableShutdownHooks();

    console.log('Quarry system worker running');
}

bootstrap().catch((error: unknown) => {
    console.error('System worker boot failed:', error);
    process.exit(1);
});
