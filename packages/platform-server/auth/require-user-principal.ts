import { ForbiddenException } from '@nestjs/common';
import type { Principal } from './principal';

/**
 * For a service method that only a signed-in user may call — their page, their
 * session — and whose first parameter is the principal: anything else (a
 * delegate, the system) gets a 403 before the method runs. The method then
 * types its principal as `Principal.User`.
 *
 *   @RequireUserPrincipal('Only users have sessions')
 *   @SecurityGate('read')
 *   async openSession(principal: Principal.User, rid: CodeWorkspace.Rid) { … }
 *
 * Above other gates, so the refusal comes first.
 */
export function RequireUserPrincipal(reason = 'Only users can do this') {
    return function <M extends (principal: Principal.User, ...rest: never[]) => Promise<unknown>>(
        _target:    object,
        _key:       string | symbol,
        descriptor: TypedPropertyDescriptor<M>,
    ): void {
        const original = descriptor.value as unknown as (this: unknown, ...args: unknown[]) => Promise<unknown>;

        descriptor.value = async function (this: unknown, principal: Principal, ...rest: unknown[]) {
            if (principal.type !== 'user')
                throw new ForbiddenException(reason);

            return original.call(this, principal, ...rest);
        } as unknown as M;
    };
}
