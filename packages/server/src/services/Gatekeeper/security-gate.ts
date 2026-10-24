import type { Gatekeeper, Library } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import type { GatekeeperService } from './gatekeeper.service';

type RidSecond<M> = M extends (principal: never, rid: infer R, ...rest: never[]) => unknown
    ? ([R] extends [Library.Resource.Rid] ? unknown : { error: 'second parameter must be a library resource Rid' })
    : never;

/**
 * Gates a service method shaped (principal, resourceRid, ...rest): asserts
 * `action` on the resource before the method runs. Service principals pass.
 *
 * Only for rules row-level security can't express — RLS already decides every
 * plain read and write of a row. Use it when the method's effect isn't a row
 * (a queued job, a probe, object storage), when its action is stricter than the
 * row's policy (revealing a credential), when RLS would answer with a silent
 * empty result, or when side effects come before the guarded row. Compound
 * checks call `this.gatekeeper.assert` explicitly. Never on the same method as
 * @Transactional.
 */
export function SecurityGate(action: Gatekeeper.Action.Name) {
    // Any principal type: a method may take a narrower one (Principal.User) that an outer decorator guarantees.
    return function <M extends (principal: never, rid: never, ...rest: never[]) => Promise<unknown>>(
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
