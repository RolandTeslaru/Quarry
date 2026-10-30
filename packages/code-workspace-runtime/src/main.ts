import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { CodeWorkspace, Forge } from '@quarry/shared/domain';
import { StdioErrors, StdioServer } from '@quarry/shared/server/stdio/stdio-server';
import { System } from '@quarry/shared/server/system';
import { RuntimeModule } from './runtime.module';

System.log.setAppName('CodeWorkspaceRuntime');
System.log.useStderr();

const log = System.log.withContext('Runtime');

async function bootstrap(): Promise<void> {
    // Nest's own logger writes to stdout below error level, so only errors (stderr) are kept.
    const app = await NestFactory.createMicroservice(RuntimeModule, {
        // Forge's run, in a job container; the IDE's calls, in a session's container.
        strategy: new StdioServer('code-workspace', [
            Forge.Runtime.Run.Request,
            CodeWorkspace.Runtime.Describe.Request,
            CodeWorkspace.Runtime.Preview.Request,
            CodeWorkspace.Runtime.Cancel.Request,
        ]),
        logger:   ['error'],
    });

    app.useGlobalFilters(new StdioErrors());

    await app.listen();
}

bootstrap().catch((error: unknown) => {
    log.error('Runtime boot failed', { error });
    process.exit(1);
});
