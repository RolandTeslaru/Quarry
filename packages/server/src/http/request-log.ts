import type { NextFunction, Request, Response } from 'express';
import { System } from '@quarry/shared/server/system';

const log = System.log.withContext('HTTP');

/**
 * One line per request, when it finishes: method, path, status, duration.
 * The path only — a query string can carry a token. 5xx logs as an error,
 * 4xx as a warning.
 */
export function requestLog(request: Request, response: Response, next: NextFunction): void {
    const startedAt = performance.now();

    response.on('finish', () => {
        const status = response.statusCode;
        const line = `${request.method} ${request.originalUrl.split('?')[0]} ${status}`;
        const meta = { ms: performance.now() - startedAt };

        if (status >= 500)
            log.error(line, meta);
        else if (status >= 400)
            log.warning(line, meta);
        else
            log.info(line, meta);
    });

    next();
}
