import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { Identity } from '@quarry/shared/domain';

interface State {
    userRid: Identity.User.Rid | null;
    token:   string | null;
}

const storage = new AsyncLocalStorage<State>();

/**
 * The user a request — or a microservice call — came from, with the token they proved it with: what a
 * microservice call made while handling it passes on (MicroserviceCaller), so the callee checks the same user.
 * Set by AuthGuard, and by MicroserviceCallReceiver around each call it handles.
 */
export const RequestIdentity = {
    get: (): State | undefined => storage.getStore(),

    set: (userRid: Identity.User.Rid, token: string): void => {
        const state = storage.getStore();

        if (state) {
            state.userRid = userRid;
            state.token = token;
        }
    },

    run: <R>(state: State, fn: () => R): R => storage.run(state, fn),
};

/** Opens each HTTP request's identity, for AuthGuard to fill. */
@Injectable()
export class RequestIdentityMiddleware implements NestMiddleware {
    use(_request: unknown, _response: unknown, next: () => void): void {
        storage.run({ userRid: null, token: null }, next);
    }
}
