import * as http from 'node:http';
import * as https from 'node:https';
import type { Request, RequestHandler, Response } from 'express';

/**
 * Browsers reach the services through the main server (docs/design/architecture-split.md): this
 * forwards a request to a service unchanged — method, path, headers, body streamed both ways — and
 * its answer back. The service authenticates and authorizes it itself. Mounted before Nest's body
 * parsers, so bodies (uploads) pass through untouched.
 */
export function createServiceProxy(service: string, target: string): RequestHandler {
    const base = new URL(target);
    const transport = base.protocol === 'https:' ? https : http;

    return (request: Request, response: Response) => {
        const upstream = transport.request({
            hostname: base.hostname,
            port:     base.port,
            method:   request.method,
            path:     request.originalUrl,
            headers:  { ...request.headers, host: base.host },
        }, (answer) => {
            response.writeHead(answer.statusCode ?? 502, answer.headers);
            answer.pipe(response);
        });

        upstream.on('error', (error) => {
            if (response.headersSent) {
                response.destroy(error);

                return;
            }

            response.status(502).json({ message: `The ${service} service didn't answer: ${error.message}` });
        });

        request.pipe(upstream);
    };
}
