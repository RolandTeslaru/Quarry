import * as path from 'node:path';
import { setUpTestDatabase } from '@quarry/platform-server/testing/test-database';

/** Once per run: a fresh test database, migrated from the main server's migrations — it alone owns them. */
export default async function setup(): Promise<void> {
    await setUpTestDatabase(path.resolve(__dirname, '../../../server/migrations'));
}
