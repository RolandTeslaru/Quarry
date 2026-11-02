// Must stay first: reflect-metadata and env before anything else loads.
import './load-env';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { waitForServer } from '@quarry/shared/server/internal-api';
import { System } from '@quarry/shared/server/system';
import { LineageExplorerMicroserviceModule } from './microservice.module';
import { useDatabaseLogin } from '@quarry/platform-kernel/db/pool';
import { requireEnv } from '@quarry/platform-kernel/db/table';
import { requestLog } from '@quarry/platform-kernel/http/request-log';
import { connectMicroserviceCalls } from '@quarry/platform-kernel/microservice/microservice-calls.module';

System.log.setAppName('LineageExplorer');

const log = System.log.withContext('LineageExplorer');

// Its own login: its system work as lineage_explorer_service, a user's transaction as lineage_explorer_user (lineage_explorer/001_initial.sql).
useDatabaseLogin({ url: requireEnv('LINEAGE_EXPLORER_DATABASE_URL'), userRole: 'lineage_explorer_user' });

// Members are bootstrapped by the main server only: this service can't write identity.user.
delete process.env.QUARRY_BOOTSTRAP_ADMIN_EMAIL;

async function bootstrap(): Promise<void> {
    // The main server migrates and sets this service's login: it answers its health check after both.
    await waitForServer();

    const app = await NestFactory.create<NestExpressApplication>(LineageExplorerMicroserviceModule);

    app.use(requestLog);
    app.setGlobalPrefix('api');
    app.enableShutdownHooks();
    await connectMicroserviceCalls(app, 'lineage-explorer');

    const port = Number(process.env.LINEAGE_EXPLORER_PORT ?? 4050);

    await app.listen(port);

    log.info('Lineage Explorer listening', { port });
}

bootstrap().catch((error: unknown) => {
    log.error('Lineage Explorer boot failed', { error });
    process.exit(1);
});
