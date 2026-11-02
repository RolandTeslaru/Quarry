import { Client } from 'pg';
import { withDatabase } from '@quarry/platform-kernel/testing/test-env';
import type { PostgresLogin } from './data-connection-fixtures';

/** The "external" system: a throwaway database on the dev Postgres, with a few rows to copy. */
export async function createExternalDatabase(name: string): Promise<PostgresLogin> {
    const url = new URL(process.env.DATABASE_URL ?? '');
    const admin = new Client({ connectionString: withDatabase(url.toString(), 'postgres') });

    await admin.connect();
    await admin.query(`CREATE DATABASE ${name}`);
    await admin.end();

    const client = new Client({ connectionString: withDatabase(url.toString(), name) });

    await client.connect();
    await client.query(`
        CREATE TABLE public.tools (id integer PRIMARY KEY, name text NOT NULL, updated_at timestamptz NOT NULL);
        INSERT INTO public.tools VALUES (1, 'hammer', '2026-10-01'), (2, 'saw', '2026-10-02'), (3, 'drill', '2026-10-03');
        CREATE SCHEMA inventory;
        CREATE TABLE inventory.parts (sku text PRIMARY KEY);`);
    await client.end();

    return {
        host:     url.hostname,
        port:     Number(url.port || 5432),
        database: name,
        user:     decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
    };
}

export async function dropExternalDatabase(name: string): Promise<void> {
    const admin = new Client({ connectionString: withDatabase(process.env.DATABASE_URL ?? '', 'postgres') });

    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
}
