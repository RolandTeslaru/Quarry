// Must stay first: reflect-metadata and env before anything else loads.
import './load-env';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { System } from '@quarry/shared/server/system';
import { ApiModule } from './api.module';
import { db } from '@quarry/platform-server/db/pool';
import { migrateAll } from '@quarry/platform-server/db/migrator';
import { MIGRATIONS_FOLDER } from './migrations-folder';
import { setServiceLogins } from '@quarry/platform-server/db/service-logins';
import { configureMainServer } from './http/main-server';

System.log.setAppName('Server');

const log = System.log.withContext('Server');

async function bootstrap(): Promise<void> {
    // The main server owns migrations: the services and workers start after it and never migrate.
    await migrateAll(db(), MIGRATIONS_FOLDER);
    await setServiceLogins(db());

    const app = await NestFactory.create<NestExpressApplication>(ApiModule);

    configureMainServer(app, { catalog: process.env.CATALOG_URL ?? 'http://localhost:4010' });
    app.enableShutdownHooks();

    const port = Number(process.env.PORT ?? 4000);

    await app.listen(port);

    log.info('API listening', { port });
}

bootstrap().catch((error: unknown) => {
    log.error('API boot failed', { error });
    process.exit(1);
});
