import type { Library } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import type { NewEvent } from './audit.repository';
import type { AuditService } from './audit.service';

type RidSecond<M> = M extends (principal: never, rid: infer R, ...rest: never[]) => unknown
    ? ([R] extends [Library.Resource.Rid] ? unknown : { error: 'second parameter must be a library resource Rid' })
    : never;

/**
 * Records an access event when a service method shaped (principal, resourceRid,
 * ...rest) succeeds — for reads, downloads and reveals, which no trigger can see.
 * Recorded after the method, in a transaction of its own; if recording fails,
 * the call fails — an access the log can't record isn't handed out. Goes above
 * @SecurityGate, so a refusal is the gate's (recorded as `denied`), not a read.
 *
 *   @Audit('reveal')
 *   @SecurityGate('write')
 *   async reveal(principal, rid) { … }
 *
 *   @Audit('read', (sequence?: number) => ({ op: 'view', sequence }))
 */
export function Audit<Rest extends unknown[] = never[]>(
    action: NewEvent['action'],
    detail?: (...rest: Rest) => Record<string, unknown>,
) {
    return function <M extends (principal: never, rid: never, ...rest: never[]) => Promise<unknown>>(
        _target:    { audit: AuditService },                // the class must inject AuditService
        _key:       string | symbol,
        descriptor: TypedPropertyDescriptor<M> & RidSecond<M>,
    ): void {
        const original = descriptor.value as unknown as (this: unknown, ...args: unknown[]) => Promise<unknown>;

        descriptor.value = async function (this: { audit: AuditService }, principal: Principal, rid: Library.Resource.Rid, ...rest: unknown[]) {
            const result = await original.call(this, principal, rid, ...rest);

            await this.audit.record(principal, { resourceRid: rid, action, detail: detail?.(...rest as Rest) });

            return result;
        } as unknown as M;
    };
}
