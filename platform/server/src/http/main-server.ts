import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { requestLog } from '@quarry/platform-kernel/http/request-log';
import { createServiceProxy } from './service-proxy';

/** The services the main server forwards browsers to, by route prefix (docs/design/architecture-split.md). */
export interface ServiceUrls {
    readonly catalog:        string;
    readonly dataConnection: string;
    readonly forge:          string;
    readonly codeWorkspace:  string;
}

/** The main server's HTTP setup — api.ts's, and the end-to-end tests'. */
export function configureMainServer(app: NestExpressApplication, services: ServiceUrls): void {
    app.use(requestLog);
    // Before Nest's body parsers, so bodies pass through to the service untouched.
    // Each service under its own prefix (architecture-split.md, phase 2).
    app.use('/api/catalog', createServiceProxy('Catalog', services.catalog));
    app.use('/api/data-connection', createServiceProxy('Data Connection', services.dataConnection));
    app.use('/api/forge', createServiceProxy('Forge', services.forge));
    app.use('/api/code-workspaces', createServiceProxy('Code Workspaces', services.codeWorkspace));
    app.use('/api/git', createServiceProxy('Code Workspaces', services.codeWorkspace));
    app.setGlobalPrefix('api');
    app.useWebSocketAdapter(new WsAdapter(app));            // /socket — plain WebSockets (ws), as in PretzelGraph
    app.enableCors({
        origin:      (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((origin) => origin.trim()),
        credentials: true,
    });
}
