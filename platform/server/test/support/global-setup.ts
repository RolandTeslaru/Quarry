import { setUpTestDatabase } from '@quarry/platform-kernel/testing/test-database';
import { MIGRATIONS_FOLDER } from '@/migrations-folder';

/** Once per run: a fresh, migrated test database (platform-server/testing). */
export default async function setup(): Promise<void> {
    await setUpTestDatabase(MIGRATIONS_FOLDER);
}
