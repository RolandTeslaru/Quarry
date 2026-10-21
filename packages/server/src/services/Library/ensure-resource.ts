import { NotFoundException } from '@nestjs/common';
import type { Library } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { currentTransaction, runWithResource } from '@/db/repository';
import { insertResource, liveResources, visibleResources } from './library.statements';

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
 * point; this decorator, on its repository's create method, writes the
 * library row first — in the same transaction — so both commit or neither.
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
 * @Transactional. The SQL stays Library's (library.statements).
 */
export function EnsureResource(type: Exclude<Library.Resource.Type, 'project' | 'folder'>) {
    return function <M extends (principal: Principal, values: never, ...rest: never[]) => Promise<unknown>>(
        _target:    object,
        _key:       string | symbol,
        descriptor: TypedPropertyDescriptor<M> & ValuesSecond<M>,
    ): void {
        const original = descriptor.value as unknown as (this: unknown, ...args: unknown[]) => Promise<unknown>;

        descriptor.value = async function (this: unknown, principal: Principal, values: ResourceValues, ...rest: unknown[]) {
            const trx = currentTransaction();

            if (!(await liveResources(trx, [values.parentRid])).has(values.parentRid)
                || !(await visibleResources(trx, [values.parentRid])).has(values.parentRid))
                throw new NotFoundException('Not found');

            const row = await insertResource(trx, {
                rid:         values.rid,
                type,
                name:        values.name,
                description: values.description,
                parentRid:   values.parentRid,
                createdBy:   Principal.actorOf(principal),
            });

            return runWithResource(row, () => original.call(this, principal, values, ...rest));
        } as unknown as M;
    };
}
