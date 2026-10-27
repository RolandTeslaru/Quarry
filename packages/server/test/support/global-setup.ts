import { promises as fs } from 'node:fs';
import { Client } from 'pg';
import { TEST_DATABASE, TEST_GIT_ROOT, useTestEnv, withDatabase } from './test-env';

/**
 * Once per run: a fresh test database, migrated to the current schema (the
 * migrations are living files, so it's rebuilt rather than reused), an
 * empty test Redis database, and no test Git repositories.
 */
export default async function setup(): Promise<void> {
    const databaseUrl = useTestEnv();
    const admin = new Client({ connectionString: withDatabase(databaseUrl, 'postgres') });

    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();

    const { db, destroyPool } = await import('@/db/pool');
    const { migrateAll } = await import('@/db/migrator');

    await migrateAll(db());
    await destroyPool();

    const { default: Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL ?? '');

    await redis.flushdb();
    await redis.quit();

    await fs.rm(TEST_GIT_ROOT, { recursive: true, force: true });
}
