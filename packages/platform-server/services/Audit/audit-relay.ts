import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { Audit } from '@quarry/shared/domain';
import { DurableQueueHandle, InjectDurableQueue } from '@quarry/platform-server/infra/durable-queue';

const storage = new AsyncLocalStorage<{ queued: boolean }>();

/**
 * An audit record is queued inside a transaction — often one it joins (an open) — so it can only be
 * relayed after that commits. Each HTTP request notes whether it queued one, and relays once it has
 * answered: by then its transactions are committed. Records queued outside a request wait for the
 * durable-queue sweep.
 */
export const AuditRelay = {
    markQueued: (): void => {
        const state = storage.getStore();

        if (state)
            state.queued = true;
    },
};

@Injectable()
export class AuditRelayMiddleware implements NestMiddleware {

    constructor(
        @InjectDurableQueue(Audit.DurableQueue.Record)
        private readonly recordQueue: DurableQueueHandle<typeof Audit.Queue.Record.Definition>,
    ) {}

    use(_request: Request, response: Response, next: NextFunction): void {
        const state = { queued: false };

        response.on('finish', () => {
            if (state.queued)
                void this.recordQueue.relay();
        });

        storage.run(state, next);
    }
}
