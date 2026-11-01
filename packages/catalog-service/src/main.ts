// Must stay first: reflect-metadata and env before anything else loads.
import './load-env';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { waitForServer } from '@quarry/shared/server/internal-api';
import { System } from '@quarry/shared/server/system';
import { CatalogServiceModule } from './catalog-service.module';
import { useDatabaseLogin } from '@quarry/platform-server/db/pool';
import { requireEnv } from '@quarry/platform-server/db/table';
import { requestLog } from '@quarry/platform-server/http/request-log';

System.log.setAppName('Catalog');

const log = System.log.withContext('Catalog');

// Its own login: its system work as catalog_service, a user's transaction as catalog_user (catalog/001_initial.sql).
useDatabaseLogin({ url: requireEnv('CATALOG_DATABASE_URL'), userRole: 'catalog_user' });

// Members are bootstrapped by the main server only: this service can't write identity.user.
delete process.env.QUARRY_BOOTSTRAP_ADMIN_EMAIL;

async function bootstrap(): Promise<void> {
    // The main server migrates and sets this service's login: it answers its health check after both.
    await waitForServer();

    const app = await NestFactory.create<NestExpressApplication>(CatalogServiceModule);

    app.use(requestLog);
    app.setGlobalPrefix('api');
    app.enableShutdownHooks();

    const port = Number(process.env.CATALOG_PORT ?? 4010);

    await app.listen(port);

    log.info('Catalog listening', { port });
}

bootstrap().catch((error: unknown) => {
    log.error('Catalog boot failed', { error });
    process.exit(1);
});
