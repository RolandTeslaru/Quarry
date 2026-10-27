import * as os from 'node:os';
import * as path from 'node:path';
import dotenv from 'dotenv';

// Each overridable, so two runs at once (two agents, two terminals) each get their own:
//   QUARRY_TEST_DATABASE=quarry_test_2 QUARRY_TEST_REDIS_DATABASE=14 QUARRY_TEST_GIT_ROOT=/tmp/quarry-test-git-2 npm test

/** The test database, on the dev Postgres: dropped, created and migrated at the start of each run. */
export const TEST_DATABASE = process.env.QUARRY_TEST_DATABASE ?? 'quarry_test';

if (!/^quarry_test\w*$/.test(TEST_DATABASE))
    throw new Error(`QUARRY_TEST_DATABASE must start with quarry_test (it's dropped every run): ${TEST_DATABASE}`);

/** Redis database for tests: BullMQ keys are per database, so test jobs never reach dev queues or a running ForgeAgent. */
export const TEST_REDIS_DATABASE = Number(process.env.QUARRY_TEST_REDIS_DATABASE ?? 15);

/** Code Workspaces' bare repositories for tests: never the dev ones (QUARRY_GIT_ROOT). Emptied at the start of each run. */
export const TEST_GIT_ROOT = process.env.QUARRY_TEST_GIT_ROOT ?? path.join(os.tmpdir(), 'quarry-test-git');

/** Loads the repo's .env, then points the database, Redis and Git root at the test ones. Returns the test database's URL. */
export function useTestEnv(): string {
    dotenv.config({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });

    const databaseUrl = withDatabase(requireEnv('DATABASE_URL'), TEST_DATABASE);

    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = withDatabase(requireEnv('REDIS_URL'), String(TEST_REDIS_DATABASE));
    process.env.QUARRY_GIT_ROOT = TEST_GIT_ROOT;
    process.env.CODE_WORKSPACE_WORKER_URL = 'http://127.0.0.1:9';        // never the dev worker: tests stub it, or it's unreachable

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
