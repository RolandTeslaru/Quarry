import type { Gatekeeper, Library } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import type { GatekeeperService } from './gatekeeper.service';

type RidSecond<M> = M extends (principal: Principal, rid: infer R, ...rest: never[]) => unknown
    ? ([R] extends [Library.Resource.Rid] ? unknown : { error: 'second parameter must be a library resource Rid' })
    : never;

/**
 * Gates a service method shaped (principal, resourceRid, ...rest): asserts
 * `action` on the resource before the method runs. Service principals pass.
 *
 * The service-layer counterpart of @Transactional — never both on one method.
 * Compound checks (move, run sync) call `this.gatekeeper.assert` explicitly.
 */
export function SecurityGate(action: Gatekeeper.Action.Name) {
    return function <M extends (principal: Principal, rid: never, ...rest: never[]) => Promise<unknown>>(
        _target:    { gatekeeper: GatekeeperService },      // the class must inject GatekeeperService
        _key:       string | symbol,
        descriptor: TypedPropertyDescriptor<M> & RidSecond<M>,
    ): void {
        const original = descriptor.value as unknown as (this: unknown, ...args: unknown[]) => Promise<unknown>;

        descriptor.value = async function (this: { gatekeeper: GatekeeperService }, principal: Principal, rid: Library.Resource.Rid, ...rest: unknown[]) {
            await this.gatekeeper.assert(principal, action, rid);

            return original.call(this, principal, rid, ...rest);
        } as unknown as M;
    };
}
