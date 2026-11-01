import { promises as fs } from 'node:fs';
import { Client } from 'pg';
import { TEST_DATABASE, TEST_GIT_ROOT, useTestEnv, withDatabase } from './test-env';

/**
 * Once per test run, for any package's tests: a fresh test database, migrated from the main server's
 * migrations (they're living files, so it's rebuilt rather than reused), the services' logins set, an
 * empty test Redis database, and no test Git repositories.
 */
export async function setUpTestDatabase(migrationsFolder: string): Promise<void> {
    const databaseUrl = useTestEnv();
    const admin = new Client({ connectionString: withDatabase(databaseUrl, 'postgres') });

    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await admin.end();

    const { db, destroyPool } = await import('../db/pool');
    const { migrateAll } = await import('../db/migrator');
    const { setServiceLogins } = await import('../db/service-logins');

    await migrateAll(db(), migrationsFolder);
    await setServiceLogins(db());
    await destroyPool();

    const { default: Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL ?? '');

    await redis.flushdb();
    await redis.quit();

    await fs.rm(TEST_GIT_ROOT, { recursive: true, force: true });
}
