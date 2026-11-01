// Must stay first: reflect-metadata and env before anything else loads.
import './load-env';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { System } from '@quarry/shared/server/system';
import { MainServerModule } from './main-server.module';
import { db } from '@quarry/platform-kernel/db/pool';
import { migrateAll } from '@quarry/platform-kernel/db/migrator';
import { MIGRATIONS_FOLDER } from './migrations-folder';
import { setServiceLogins } from '@quarry/platform-kernel/db/service-logins';
import { configureMainServer } from './http/main-server';
import { connectMicroserviceCalls } from '@quarry/platform-kernel/microservice/microservice-calls.module';

System.log.setAppName('Server');

const log = System.log.withContext('Server');

async function bootstrap(): Promise<void> {
    // The main server owns migrations: the services and workers start after it and never migrate.
    await migrateAll(db(), MIGRATIONS_FOLDER);
    await setServiceLogins(db());

    const app = await NestFactory.create<NestExpressApplication>(MainServerModule);

    configureMainServer(app, {
        catalog:        process.env.CATALOG_URL ?? 'http://localhost:4010',
        dataConnection: process.env.DATA_CONNECTION_URL ?? 'http://localhost:4020',
    });
    app.enableShutdownHooks();
    await connectMicroserviceCalls(app, 'main');

    const port = Number(process.env.PORT ?? 4000);

    await app.listen(port);

    log.info('API listening', { port });
}

bootstrap().catch((error: unknown) => {
    log.error('API boot failed', { error });
    process.exit(1);
});
