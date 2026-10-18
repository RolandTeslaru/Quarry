import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import { Pool, types as pgTypes, type CustomTypesConfig } from 'pg';
import type { Principal } from '@/auth/principal';
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

// One pool for the whole process. Every schema's database module is a typed
// view over it — they differ in TypeScript only.
let instance: Kysely<unknown> | undefined;

export const db = (): Kysely<unknown> =>
    (instance ??= new Kysely<unknown>({
        dialect: new PostgresDialect({
            pool: new Pool({
                connectionString: requireEnv('DATABASE_URL'),
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
 * Builds a schema's database module. No RLS: `app.user_rid` (and `app.via` for
 * delegates) are set for audit triggers and logs, not for row filtering —
 * authorization is Gatekeeper's.
 */
export function defineDatabase<T>(): Database<T> {
    return {
        asUser: (principal, fn) =>
            db().transaction().execute(async (trx) => {
                const via = principal.type === 'delegate' ? principal.via : '';

                await sql`select set_config('app.user_rid', ${principal.userRid}, true), set_config('app.via', ${via}, true)`.execute(trx);

                return fn(trx as unknown as Transaction<T>);
            }),

        asService: (_reason, fn) =>
            db().transaction().execute((trx) => fn(trx as unknown as Transaction<T>)),
    };
}
