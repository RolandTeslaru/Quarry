import type { Library } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import { runWithResource } from '@/db/repository';
import type { ResourceRepository } from './resource.repository';

/** What a subtype's create method must receive (second parameter) for its library row. */
export interface ResourceValues {
    readonly rid:         Library.Resource.Rid;
    readonly name:        string;
    readonly description: string | null;
    readonly parentRid:   Library.Resource.Rid;
}

type ValuesSecond<M> = M extends (principal: Principal, values: infer V, ...rest: never[]) => unknown
    ? ([V] extends [ResourceValues] ? unknown : { error: 'second parameter must carry rid, name, description, parentRid' })
    : never;

/**
 * A resource subtype is one thing split across two schemas: its library row
 * (name, place in the tree) and its own row. The owning service is the entry
 * point; this decorator, on its repository's create method, has Library write
 * the library row first (`ResourceRepository.insert`, joining the transaction),
 * so both commit or neither.
 *
 *   @Transactional()
 *   @EnsureResource('dataset')
 *   async create(principal, values: { rid, name, description, parentRid, … }) {
 *       this.resource            // the library row, like this.trx
 *       …insert the subtype's own rows…
 *   }
 *
 * The parent must be live and visible to the user (404 otherwise); whether they
 * may write into it is RLS's call on the insert (403). Must sit under
 * @Transactional; the class injects ResourceRepository as `resources`.
 */
export function EnsureResource(type: Exclude<Library.Resource.Type, 'project' | 'folder'>) {
    return function <M extends (principal: Principal, values: never, ...rest: never[]) => Promise<unknown>>(
        _target:    { resources: ResourceRepository },       // the class must inject ResourceRepository
        _key:       string | symbol,
        descriptor: TypedPropertyDescriptor<M> & ValuesSecond<M>,
    ): void {
        const original = descriptor.value as unknown as (this: unknown, ...args: unknown[]) => Promise<unknown>;

        descriptor.value = async function (this: { resources: ResourceRepository }, principal: Principal, values: ResourceValues, ...rest: unknown[]) {
            const row = await this.resources.insert(principal, {
                rid:         values.rid,
                type,
                name:        values.name,
                description: values.description,
                parentRid:   values.parentRid,
            });

            return runWithResource(row, () => original.call(this, principal, values, ...rest));
        } as unknown as M;
    };
}
