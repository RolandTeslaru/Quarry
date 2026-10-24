import { spawn } from 'node:child_process';
import type { Request, Response } from 'express';
import { System } from '@quarry/shared/server/system';

const log = System.log.withContext('CodeWorkspace.Git');

/** Where a CGI response's headers end. */
const HEADER_END = /\r?\n\r?\n/;

export interface BackendRequest {
    /** The directory holding the bare repositories. */
    readonly projectRoot: string;
    /** `/<repository>.git/info/refs`, `/<repository>.git/git-receive-pack`, … */
    readonly pathInfo:    string;
    /** Recorded by Git as the pusher (the user's RID). */
    readonly remoteUser:  string;
}

/**
 * Runs Git's smart-HTTP server (`git http-backend`, a CGI program) for one
 * request: the request body to its stdin, its CGI headers to the response's
 * status and headers, the rest of its stdout streamed through. Who may do what
 * is decided before this, by the caller.
 */
export function serveGit(request: Request, response: Response, backend: BackendRequest): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn('git', ['http-backend'], {
            env: {
                ...process.env,
                GIT_PROJECT_ROOT:     backend.projectRoot,
                GIT_HTTP_EXPORT_ALL:  '1',
                PATH_INFO:            backend.pathInfo,
                REMOTE_USER:          backend.remoteUser,
                REMOTE_ADDR:          request.ip ?? '',
                REQUEST_METHOD:       request.method,
                QUERY_STRING:         queryString(request),
                CONTENT_TYPE:         request.headers['content-type'] ?? '',
                HTTP_CONTENT_ENCODING: request.headers['content-encoding'] ?? '',     // clients gzip fetch requests
                GIT_PROTOCOL:         headerValue(request.headers['git-protocol']),
            },
        });

        let headersSent = false;
        let buffered = Buffer.alloc(0);

        child.stdout.on('data', (chunk: Buffer) => {
            if (headersSent) {
                response.write(chunk);

                return;
            }

            buffered = Buffer.concat([buffered, chunk]);

            const text = buffered.toString('latin1');
            const end = HEADER_END.exec(text);

            if (!end)
                return;

            writeCgiHeaders(response, text.slice(0, end.index));
            headersSent = true;

            const body = buffered.subarray(end.index + end[0].length);

            if (body.length > 0)
                response.write(body);
        });

        child.stderr.on('data', (chunk: Buffer) => {
            log.warning('git http-backend', { message: chunk.toString().trim() });
        });

        child.on('error', reject);

        child.on('close', code => {
            if (!headersSent && !response.headersSent)
                response.status(500);

            if (code !== 0)
                log.warning('git http-backend exited', { code, path: backend.pathInfo });

            response.end();
            resolve();
        });

        request.pipe(child.stdin);
    });
}

/** `Status: 404 Not Found` sets the status; every other line is a header. */
function writeCgiHeaders(response: Response, block: string): void {
    for (const line of block.split(/\r?\n/)) {
        const separator = line.indexOf(':');

        if (separator === -1)
            continue;

        const name = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();

        if (name.toLowerCase() === 'status')
            response.status(Number.parseInt(value, 10));
        else
            response.setHeader(name, value);
    }
}

function queryString(request: Request): string {
    const index = request.originalUrl.indexOf('?');

    return index === -1 ? '' : request.originalUrl.slice(index + 1);
}

function headerValue(value: string | string[] | undefined): string {
    return Array.isArray(value) ? value.join(',') : value ?? '';
}
