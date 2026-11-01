import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { Gatekeeper } from '@quarry/shared/domain';

/**
 * Per-request memo of effective ranks, keyed by (principal, resource). A rank
 * answers every action, so the key needn't include the action — but it must
 * include the principal: a check made as SELF must never answer one made as
 * the user. Dies with the request, so it is always correct.
 */
const storage = new AsyncLocalStorage<Map<string, Gatekeeper.Role.Rank>>();

export const RequestMemo = {
    get: (key: string) => storage.getStore()?.get(key),
    set: (key: string, rank: Gatekeeper.Role.Rank) => storage.getStore()?.set(key, rank),
};

/** Opens a memo for each HTTP request. Workers run without one (no memoization). */
@Injectable()
export class RequestMemoMiddleware implements NestMiddleware {
    use(_request: unknown, _response: unknown, next: () => void): void {
        storage.run(new Map(), next);
    }
}
