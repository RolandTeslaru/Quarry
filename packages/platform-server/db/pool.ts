import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import { Pool, types as pgTypes, type CustomTypesConfig } from 'pg';
import type { Principal } from '@quarry/platform-server/auth/principal';
import { requireEnv } from './table';

const OID_INT8 = 20;

// bigint columns (sequences, row counts, byte sizes) come back as strings by
// default. Every value we store fits in a double, so parse them as numbers.
const typeParsers: CustomTypesConfig = {
    getTypeParser: ((oid: number, format?: unknown) =>
        oid === OID_INT8
            ? (value: string) => Number(value)
            : (pgTypes.getTypeParser as (o: number, f?: unknown) => unknown)(oid, format)
    ) as CustomTypesConfig['getTypeParser'],
};

/**
 * Who this process is to Postgres: the login it connects as — its system work runs as that — and
 * the role a user's or delegate's transaction switches to. The main server: the owner
 * (`DATABASE_URL`) and `main_user`; the Catalog service: `catalog_service` and `catalog_user`
 * (docs/design/architecture-split.md §5).
 */
export interface DatabaseLogin {
    readonly url:      string;
    readonly userRole: string;
}

let login: DatabaseLogin | undefined;

/** Before the first query: this process's login. Without it, the main server's. */
export function useDatabaseLogin(next: DatabaseLogin): void {
    login = next;
}

const getLogin = (): DatabaseLogin => (login ??= { url: requireEnv('DATABASE_URL'), userRole: 'main_user' });

// One pool for the whole process. Every schema's database module is a typed
// view over it — they differ in TypeScript only.
let instance: Kysely<unknown> | undefined;

export const db = (): Kysely<unknown> =>
    (instance ??= new Kysely<unknown>({
        dialect: new PostgresDialect({
            pool: new Pool({
                connectionString: getLogin().url,
                max:              10,
                types:            typeParsers,
            }),
        }),
    }));

export async function destroyPool(): Promise<void> {
    await instance?.destroy();
    instance = undefined;
}

/** What a schema's database module offers: transactions typed against its tables. */
export interface Database<T> {
    /** A user, or a delegate acting for one. */
    asUser<R>(principal: Principal.User | Principal.Delegate, fn: (trx: Transaction<T>) => Promise<R>): Promise<R>;
    asService<R>(reason: string, fn: (trx: Transaction<T>) => Promise<R>): Promise<R>;
}

/**
 * Builds a schema's database module. A user's (or delegate's) transaction runs
 * as this process's user role with `app.user_rid` set — a member of `quarry_user`,
 * so every table's row-level security applies; the policies ask Gatekeeper's rank
 * function for that user (gatekeeper/001_initial.sql). `app.via` names a delegate's
 * job, for logs. Service transactions stay on the process's login: the owner in the
 * main server, which RLS doesn't restrict; a service's own login elsewhere.
 */
export function defineDatabase<T>(): Database<T> {
    return {
        asUser: (principal, fn) =>
            db().transaction().execute(async (trx) => {
                const via = principal.type === 'delegate' ? principal.via : '';

                await sql`select set_config('app.user_rid', ${principal.userRid}, true), set_config('app.via', ${via}, true)`.execute(trx);
                await sql`set local role ${sql.id(getLogin().userRole)}`.execute(trx);

                return fn(trx as unknown as Transaction<T>);
            }),

        asService: (_reason, fn) =>
            db().transaction().execute((trx) => fn(trx as unknown as Transaction<T>)),
    };
}
