import { AsyncLocalStorage } from 'node:async_hooks';
import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { Transaction } from 'kysely';
import { Library } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import type { LibraryDB } from '@/services/Library/library.db';
import { liveResources } from '@/services/Library/library.statements';
import type { Database } from './pool';
import { catchDatabaseErrors } from './errors';

/**
 * The repository pattern (from PretzelCloud): a repository method takes the
 * acting principal first, and @Transactional opens the transaction and hands
 * the method its handle via `this.trx`. Services never see a transaction, so a
 * transaction never outlives one repository method.
 *
 * Nothing propagates: a decorated method calling another decorated method
 * throws. Compose inside one repository method with `_`-prefixed helpers.
 */

type Kind = Principal['type'];

type PrincipalOf<K extends Kind> = Extract<Principal, { type: K }>;

const transactionStorage = new AsyncLocalStorage<{ trx: unknown }>();

/** The library row @EnsureResource inserted for the current call. */
const resourceStorage = new AsyncLocalStorage<LibraryDB.Resource.Row>();

/** Runs `fn` with `row` as `this.resource` — used by @EnsureResource only. */
export function runWithResource<R>(row: LibraryDB.Resource.Row, fn: () => R): R {
    return resourceStorage.run(row, fn);
}

const DATABASE = Symbol.for('quarry.repository.database');

function getDatabase(instance: object): Database<unknown> {
    const database = (instance.constructor as unknown as Record<symbol, Database<unknown> | undefined>)[DATABASE];

    if (!database)
        throw new InternalServerErrorException('@Transactional on a class that does not extend Repository(...)');

    return database;
}

/**
 * The transaction the current @Transactional call opened, untyped — for
 * decorators that run inside it on another schema's behalf (@EnsureResource).
 */
export function currentTransaction(): Transaction<unknown> {
    const store = transactionStorage.getStore();

    if (!store)
        throw new InternalServerErrorException('No open transaction — put this decorator under @Transactional');

    return store.trx as Transaction<unknown>;
}

/**
 * Base class factory. The argument binds the subclass to one schema's
 * database module — `this.trx` types against its tables only.
 */
export function Repository<T>(database: Database<T>) {

    abstract class RepositoryBase {

        public static readonly [DATABASE] = database;

        /** The transaction @Transactional opened for the current call. */
        protected get trx(): Transaction<T> {
            const store = transactionStorage.getStore();

            if (!store)
                throw new InternalServerErrorException('No open transaction — is the method missing @Transactional?');

            return store.trx as Transaction<T>;
        }

        /** The library row @EnsureResource inserted for this call, in this transaction. */
        protected get resource(): LibraryDB.Resource.Row {
            const row = resourceStorage.getStore();

            if (!row)
                throw new InternalServerErrorException('No resource — is the method missing @EnsureResource?');

            return row;
        }
    }

    return RepositoryBase;
}

const ALL_KINDS: readonly Kind[] = ['user', 'delegate', 'service'];

const ALLOW_TRASHED = Symbol.for('quarry.repository.allowTrashed');

/**
 * Exempts one parameter from @Transactional's liveness check — for the few
 * paths that act on trashed resources on purpose (restore, purge, trash
 * listing). Decided per parameter: restore(principal, @AllowTrashed() rid, parentRid)
 * still requires the destination to be live.
 */
export function AllowTrashed(): ParameterDecorator {
    return (target, key, index) => {
        const holder = target as Record<symbol, Map<string | symbol | undefined, Set<number>> | undefined>;
        const byMethod = (holder[ALLOW_TRASHED] ??= new Map());
        const indexes = byMethod.get(key) ?? new Set<number>();

        indexes.add(index);
        byMethod.set(key, indexes);
    };
}

function allowedTrashed(target: object, key: string | symbol): Set<number> {
    return (target as Record<symbol, Map<string | symbol, Set<number>> | undefined>)[ALLOW_TRASHED]?.get(key) ?? new Set();
}

/** Top-level arguments that are library-resource RIDs (by value), minus @AllowTrashed ones. */
function resourceRidsOf(args: unknown[], exempt: Set<number>): Library.Resource.Rid[] {
    const rids: Library.Resource.Rid[] = [];

    args.forEach((arg, index) => {
        if (index === 0 || exempt.has(index) || typeof arg !== 'string')
            return;

        const parsed = Library.Resource.Rid.safeParse(arg);

        if (parsed.success)
            rids.push(parsed.data);
    });

    return rids;
}

type MethodDecoratorFor<P extends Principal> =
    <M extends (principal: P, ...rest: never[]) => Promise<unknown>>(
        target: object, key: string | symbol, descriptor: TypedPropertyDescriptor<M>,
    ) => void;

/**
 * Opens a transaction as the principal in the method's first argument.
 *
 *   @Transactional()            any principal — the usual case; services pass theirs on
 *   @Transactional('service')   system-only (housekeeping, permission lookups)
 *
 * Inside the transaction, before the method runs, every top-level argument
 * that is a library-resource RID (project, folder, dataset, source — detected
 * by value) must be live: it exists, isn't trashed, and no ancestor is.
 * Otherwise 404. Exempt a parameter with @AllowTrashed(). RIDs inside payload
 * objects aren't checked — the convention is: resources you act on are
 * top-level parameters; @EnsureResource checks a new resource's parent.
 *
 * Kinds are checked at compile time and at runtime. Driver errors become HTTP
 * exceptions.
 */
export function Transactional(): MethodDecoratorFor<Principal>;
export function Transactional<K extends [Kind, ...Kind[]]>(...accepted: K): MethodDecoratorFor<PrincipalOf<K[number]>>;
export function Transactional(...requested: Kind[]): MethodDecoratorFor<Principal> {
    const accepted = requested.length > 0 ? requested : ALL_KINDS;

    return function <M extends (principal: Principal, ...rest: never[]) => Promise<unknown>>(
        target: object,
        key: string | symbol,
        descriptor: TypedPropertyDescriptor<M>,
    ): void {
        const original = descriptor.value;

        if (!original)
            throw new Error(`@Transactional(${accepted.join(', ')}) must decorate a method`);

        const operation = `${(target.constructor as { name: string }).name}.${String(key)}`;
        const exempt = allowedTrashed(target, key);

        const wrapped = async function (this: object, ...args: unknown[]): Promise<unknown> {
            const [principal, ...rest] = args as [Principal, ...unknown[]];

            if (!principal || !accepted.includes(principal.type))
                throw new InternalServerErrorException(`${operation} may not run as '${principal?.type}' (accepts: ${accepted.join(', ')})`);

            if (transactionStorage.getStore())
                throw new InternalServerErrorException(`${operation} would nest transactions — compose inside one repository method via a _ helper`);

            const database = getDatabase(this);

            const rids = resourceRidsOf(args, exempt);

            const run = async (trx: Transaction<unknown>): Promise<unknown> => {
                if (rids.length > 0) {
                    const live = await liveResources(trx, rids);

                    if (rids.some((rid) => !live.has(rid)))
                        throw new NotFoundException('Not found');
                }

                return transactionStorage.run({ trx }, () => original.apply(this, [principal, ...rest] as Parameters<M>));
            };

            return principal.type === 'service'
                ? database.asService(`${operation} (${principal.reason})`, run)
                : database.asUser(principal, run);
        };

        descriptor.value = catchDatabaseErrors(wrapped, operation) as unknown as M;
    };
}
