import type { Gatekeeper, Library } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import { assertLive, getRequiredLive } from '@/db/liveness';
import type { GatekeeperService } from './gatekeeper.service';

const GATED = Symbol.for('quarry.service.securityGate');

/** Whether the class's method has @SecurityGate — recorded on the class, so outer decorators can't hide it. For the test that every @RequireLive is enforced. */
export function isGated(target: object, key: string | symbol): boolean {
    return (target as Record<symbol, Set<string | symbol> | undefined>)[GATED]?.has(key) ?? false;
}

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
 *
 * Then the method's @RequireLive parameters must be live (404 otherwise): Gatekeeper
 * ranks a trashed resource like any other, so a gated method whose work isn't a
 * repository call marks its RID — `openSession(principal, @RequireLive() rid)`.
 */
export function SecurityGate(action: Gatekeeper.Action.Name) {
    // Any principal type: a method may take a narrower one (Principal.User) that an outer decorator guarantees.
    return function <M extends (principal: never, rid: never, ...rest: never[]) => Promise<unknown>>(
        target:     { gatekeeper: GatekeeperService },      // the class must inject GatekeeperService
        key:        string | symbol,
        descriptor: TypedPropertyDescriptor<M> & RidSecond<M>,
    ): void {
        const original = descriptor.value as unknown as (this: unknown, ...args: unknown[]) => Promise<unknown>;

        descriptor.value = async function (this: { gatekeeper: GatekeeperService }, principal: Principal, rid: Library.Resource.Rid, ...rest: unknown[]) {
            await this.gatekeeper.assert(principal, action, rid);

            // Read at call time, not here: decorator order is the compiler's (parameter decorators usually run first).
            const args = [principal, rid, ...rest];

            await assertLive([...getRequiredLive(target, key)].map((index) => args[index] as Library.Resource.Rid));

            return original.call(this, principal, rid, ...rest);
        } as unknown as M;

        ((target as unknown as Record<symbol, Set<string | symbol> | undefined>)[GATED] ??= new Set()).add(key);
    };
}
