import { z } from 'zod';
import { sql, type ColumnType, type Generated, type SelectType } from 'kysely';

/**
 * Kysely is generic over an interface of these — keys are schema-qualified
 * table names (`'catalog.dataset'`), which is what `selectFrom` resolves
 * against. `Gen` lists the columns Postgres fills in, so they stay optional on
 * insert.
 */
export type Table<T extends z.ZodTypeAny, Gen extends keyof z.output<T> = never> = {
    [K in keyof z.output<T>]: K extends Gen
        ? Generated<z.output<T>[K]>
        : ColumnType<
            z.output<T>[K],
            K extends keyof z.input<T> ? z.input<T>[K] : z.output<T>[K],
            K extends keyof z.input<T> ? z.input<T>[K] : z.output<T>[K]
        >
};

/**
 * A foundation table as other services see it: selecting compiles, inserting
 * or updating doesn't.
 */
export type ReadOnly<T> = {
    [K in keyof T]: ColumnType<SelectType<T[K]>, never, never>
};

/**
 * A jsonb value. node-postgres would turn a JS array into a Postgres array
 * literal, so values go in as explicit JSON text.
 */
export const json = <T>(value: T) => sql<T>`${JSON.stringify(value)}::jsonb`;

export function requireEnv(name: string): string {
    const value = process.env[name];

    if (!value)
        throw new Error(`${name} is not set`);

    return value;
}
