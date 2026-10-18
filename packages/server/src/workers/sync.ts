// Must stay first: reflect-metadata and env before anything else loads.
import '../load-env';

import { NestFactory } from '@nestjs/core';
import { db } from '@/db/pool';
import { waitForMigrations } from '@/db/migrator';
import { SyncWorkerModule } from './sync-worker.module';

async function bootstrap(): Promise<void> {
    // The API migrates; a worker started alongside it waits until it has.
    await waitForMigrations(db());

    // NestJS without the HTTP server: DI, modules, lifecycle hooks, @nestjs/bullmq processors.
    const app = await NestFactory.createApplicationContext(SyncWorkerModule);

    app.enableShutdownHooks();

    console.log('Quarry sync worker running');
}

bootstrap().catch((error: unknown) => {
    console.error('Sync worker boot failed:', error);
    process.exit(1);
});
