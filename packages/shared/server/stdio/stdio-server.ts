/// <reference types="node" />
import * as readline from 'node:readline';
import { Catch, type RpcExceptionFilter } from '@nestjs/common';
import { BaseRpcContext, type CustomTransportStrategy, Server } from '@nestjs/microservices';
import { lastValueFrom, type Observable, throwError } from 'rxjs';
import { Stdio } from '../../domain';

/** stdout carries only protocol messages, one per line. Logs go to stderr (`System.log.useStderr()`). */
function write(message: Stdio.FromProcess): void {
    process.stdout.write(`${JSON.stringify(message)}\n`);
}

export function sendEvent(event: Stdio.Payload<Stdio.Event.Schema>): void {
    write({
        ...event,
        type: 'event',
    });
}

/**
 * Errors through unchanged, for StdioServer to answer with their message. Nest's own RPC filter would
 * replace them with `{ status: 'error', message: 'Internal server error' }`.
 */
@Catch()
export class StdioErrors implements RpcExceptionFilter {

    public catch(exception: unknown): Observable<never> {
        return throwError(() => exception);
    }
}

/**
 * A runtime's Nest transport: requests in on stdin, responses and events out on
 * stdout. Each request is parsed whole against the schema of its pattern —
 * those the runtime serves — before its `@MessagePattern` handler gets it; the
 * handler's return value is the response's payload. Says `ready` first; the
 * process ends when stdin closes.
 */
export class StdioServer extends Server implements CustomTransportStrategy {

    constructor(
        private readonly runtime:  string,
        private readonly requests: Stdio.Request.Schema[],
    ) {
        super();
    }

    public listen(callback: () => void): void {
        const lines = readline.createInterface({ input: process.stdin });

        lines.on('line', async (line) => {
            const raw: unknown = JSON.parse(line);
            const message = Stdio.Request.Base.parse(raw);

            try {
                const schema = this.requests.find((request) => request.shape.pattern.value === message.pattern);
                const handler = this.getHandlerByPattern(message.pattern);

                if (!schema || !handler)
                    throw new Error(`This runtime doesn't serve ${message.pattern}`);

                const result = await handler(schema.parse(raw), new BaseRpcContext([]));
                const payload = await lastValueFrom(this.transformToObservable(result));

                write({
                    ...payload,
                    type: 'response',
                    id:   message.id,
                });
            }
            catch (error) {
                write({
                    type:    'error',
                    id:      message.id,
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        });

        lines.on('close', () => process.exit(0));

        sendEvent({
            event:    'ready',
            runtime:  this.runtime,
            protocol: Stdio.PROTOCOL,
        });

        callback();
    }

    public close(): void {
        process.stdin.destroy();
    }

    public on(): never {
        throw new Error('StdioServer has no transport events');
    }

    public unwrap<T>(): T {
        throw new Error('StdioServer wraps no client');
    }
}
