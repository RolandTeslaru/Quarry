// Must stay first: modules below read env at import time.
import '../load-env';

import { System } from '@quarry/shared/server/system';
import { db, destroyPool } from './pool';
import { migrateAll } from './migrator';

System.log.setAppName('Migrate');

const log = System.log.withContext('Migrate');

async function main(): Promise<void> {
    await migrateAll(db());
    await destroyPool();
}

main().catch((error: unknown) => {
    log.error('Migration failed', { error });
    process.exit(1);
});
