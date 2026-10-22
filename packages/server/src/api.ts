// Must stay first: reflect-metadata and env before anything else loads.
import './load-env';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { System } from '@quarry/shared/server/system';
import { ApiModule } from './api.module';
import { db } from './db/pool';
import { migrateAll } from './db/migrator';

System.log.setAppName('Server');

const log = System.log.withContext('Server');

async function bootstrap(): Promise<void> {
    // The API owns migrations: workers start after it and never migrate.
    await migrateAll(db());

    const app = await NestFactory.create<NestExpressApplication>(ApiModule);

    app.setGlobalPrefix('api');
    app.enableCors({
        origin:      (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((origin) => origin.trim()),
        credentials: true,
    });
    app.enableShutdownHooks();

    const port = Number(process.env.PORT ?? 4000);

    await app.listen(port);

    log.info('API listening', { port });
}

bootstrap().catch((error: unknown) => {
    log.error('API boot failed', { error });
    process.exit(1);
});
