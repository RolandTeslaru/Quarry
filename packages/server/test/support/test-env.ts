import * as path from 'node:path';
import dotenv from 'dotenv';

/** The test database, on the dev Postgres: dropped, created and migrated at the start of each run. */
export const TEST_DATABASE = 'quarry_test';

/** Redis database for tests: BullMQ keys are per database, so test jobs never reach dev queues or a running ForgeAgent. */
export const TEST_REDIS_DATABASE = 15;

/** Loads the repo's .env, then points the database and Redis at the test ones. Returns the test database's URL. */
export function useTestEnv(): string {
    dotenv.config({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });

    const databaseUrl = withDatabase(requireEnv('DATABASE_URL'), TEST_DATABASE);

    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = withDatabase(requireEnv('REDIS_URL'), String(TEST_REDIS_DATABASE));

    return databaseUrl;
}

/** The same server, another database (Postgres) or db index (Redis). */
export function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);

    parsed.pathname = `/${database}`;

    return parsed.toString();
}

function requireEnv(name: string): string {
    const value = process.env[name];

    if (!value)
        throw new Error(`${name} is not set — tests need the repo's .env`);

    return value;
}
