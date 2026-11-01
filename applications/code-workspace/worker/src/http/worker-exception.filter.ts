import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { isAxiosError } from 'axios';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { System } from '@quarry/shared/server/system';

const log = System.log.withContext('WorkerApi');

/**
 * Every failure as `{ statusCode, message }` with the reason kept — the server
 * passes it on to the page. Nest's default would answer a bare 500 for
 * anything that isn't an HttpException.
 *
 *   HttpException          as thrown (ConflictException: no open session)
 *   ZodError               400 — a malformed request
 *   the server's refusal   its own status and message (credentials: 403 / 404 when access is gone)
 *   anything else          500 with its message (setup or the IDE failing)
 */
@Catch()
export class WorkerExceptionFilter implements ExceptionFilter {

    public catch(error: unknown, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>();
        const { status, message } = getFailure(error);

        if (status >= 500)
            log.error(message, { error });

        response.status(status).json({ statusCode: status, message });
    }
}

function getFailure(error: unknown): { status: number; message: string } {
    if (error instanceof HttpException) {
        const body = error.getResponse();
        const message = typeof body === 'string' ? body : (body as { message?: unknown }).message;

        return { status: error.getStatus(), message: typeof message === 'string' ? message : error.message };
    }

    if (error instanceof ZodError)
        return { status: HttpStatus.BAD_REQUEST, message: 'Invalid request' };

    if (isAxiosError<{ message?: unknown }>(error) && error.response) {
        const message = error.response.data?.message;

        return { status: error.response.status, message: typeof message === 'string' ? message : error.message };
    }

    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: error instanceof Error ? error.message : String(error) };
}
