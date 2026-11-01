// Must stay first: reflect-metadata and env before anything else loads.
import './load-env';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { waitForServer } from '@quarry/shared/server/internal-api';
import { System } from '@quarry/shared/server/system';
import { CodeWorkspaceMicroserviceModule } from './microservice.module';
import { useDatabaseLogin } from '@quarry/platform-kernel/db/pool';
import { requireEnv } from '@quarry/platform-kernel/db/table';
import { requestLog } from '@quarry/platform-kernel/http/request-log';
import { connectMicroserviceCalls } from '@quarry/platform-kernel/microservice/microservice-calls.module';

System.log.setAppName('CodeWorkspace');

const log = System.log.withContext('CodeWorkspace');

// Its own login: its system work as code_workspace_service, a user's transaction as code_workspace_user (code_workspace/001_initial.sql).
useDatabaseLogin({ url: requireEnv('CODE_WORKSPACE_DATABASE_URL'), userRole: 'code_workspace_user' });

// Members are bootstrapped by the main server only: this service can't write identity.user.
delete process.env.QUARRY_BOOTSTRAP_ADMIN_EMAIL;

async function bootstrap(): Promise<void> {
    // The main server migrates and sets this service's login: it answers its health check after both.
    await waitForServer();

    const app = await NestFactory.create<NestExpressApplication>(CodeWorkspaceMicroserviceModule);

    app.use(requestLog);
    app.setGlobalPrefix('api');
    app.enableShutdownHooks();
    await connectMicroserviceCalls(app, 'code-workspace');

    const port = Number(process.env.CODE_WORKSPACE_PORT ?? 4040);

    await app.listen(port);

    log.info('Code Workspaces listening', { port });
}

bootstrap().catch((error: unknown) => {
    log.error('Code Workspaces boot failed', { error });
    process.exit(1);
});
