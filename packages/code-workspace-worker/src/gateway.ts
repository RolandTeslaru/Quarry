import * as http from 'node:http';
import * as net from 'node:net';
import type { Duplex } from 'node:stream';
import { System } from '@quarry/shared/server/system';
import type { SessionManager } from './session-manager';

const log = System.log.withContext('Gateway');

/** `/s/<secret>/…` — the secret is the session's capability, and VS Code's connection token. */
const SESSION_PATH = /^\/s\/([0-9a-f]{48})(?:\/|$)/;

/**
 * The IDE gateway: forwards `/s/<secret>/…` — HTTP and WebSocket upgrades — to
 * that session's VS Code on 127.0.0.1, path unchanged (VS Code serves under the
 * same base path). Each request is activity, so a used session isn't stopped
 * as idle. Unknown or stopped sessions get a 404.
 */
export function attachGateway(httpServer: http.Server, sessionManager: SessionManager) {
    httpServer.on('upgrade', (request: http.IncomingMessage, socket: Duplex, head: Buffer) => {
        const target = getTarget(request, sessionManager);

        if (!target) {
            socket.end('HTTP/1.1 404 Not Found\r\n\r\n');

            return;
        }

        proxyUpgrade(request, socket, head, target.port, () => sessionManager.touchBySecret(target.secret));
    });

    /** Express middleware: gateway paths are proxied, everything else (GET /health) goes on. */
    return (request: http.IncomingMessage, response: http.ServerResponse, next: () => void): void => {
        if (!SESSION_PATH.test(request.url ?? '')) {
            next();

            return;
        }

        const target = getTarget(request, sessionManager);

        if (!target) {
            response.writeHead(404).end('No such session, or it has stopped — open the workspace again');

            return;
        }

        proxyRequest(request, response, target.port);
    };
}

function getTarget(request: http.IncomingMessage, sessionManager: SessionManager): { port: number; secret: string } | null {
    const secret = SESSION_PATH.exec(request.url ?? '')?.[1];

    if (!secret)
        return null;

    const session = sessionManager.touchBySecret(secret);

    return session ? { port: session.port, secret } : null;
}

function proxyRequest(request: http.IncomingMessage, response: http.ServerResponse, port: number): void {
    const upstream = http.request({
        host:    '127.0.0.1',
        port,
        method:  request.method,
        path:    request.url,
        headers: request.headers,
    }, upstreamResponse => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
    });

    upstream.on('error', error => {
        log.warning('Upstream request failed', { port, error: error.message });

        if (!response.headersSent)
            response.writeHead(502);

        response.end();
    });

    request.pipe(upstream);
}

/** Replays the upgrade request to VS Code, then pipes both ways; every frame from the browser is activity. */
function proxyUpgrade(request: http.IncomingMessage, socket: Duplex, head: Buffer, port: number, touch: () => void): void {
    const upstream = net.connect(port, '127.0.0.1', () => {
        upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`);

        for (let index = 0; index < request.rawHeaders.length; index += 2)
            upstream.write(`${request.rawHeaders[index]}: ${request.rawHeaders[index + 1]}\r\n`);

        upstream.write('\r\n');

        if (head.length > 0)
            upstream.write(head);

        socket.pipe(upstream).pipe(socket);
    });

    socket.on('data', touch);

    const close = () => {
        upstream.destroy();
        socket.destroy();
    };

    upstream.on('error', close);
    socket.on('error', close);
    upstream.on('close', close);
    socket.on('close', close);
}
