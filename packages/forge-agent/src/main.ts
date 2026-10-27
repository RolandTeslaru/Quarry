// load-env first: reflect-metadata and the env every other module reads.
import './load-env';
import { NestFactory } from '@nestjs/core';
import { System } from '@quarry/shared/server/system';
import { AgentModule } from './agent.module';
import { waitForServer } from './forge-api';

System.log.setAppName('ForgeAgent');

const log = System.log.withContext('Agent');

async function bootstrap(): Promise<void> {
    // Started alongside the server, it may come up first — every job goes through the ForgeAgent API.
    await waitForServer();

    const app = await NestFactory.create(AgentModule);

    app.enableShutdownHooks();                      // finish or release the current jobs on stop

    const port = Number(process.env.FORGE_AGENT_PORT ?? 4105);

    await app.listen(port);

    log.info('ForgeAgent listening', { port });
}

bootstrap().catch((error: unknown) => {
    log.error('ForgeAgent boot failed', { error });
    process.exit(1);
});
