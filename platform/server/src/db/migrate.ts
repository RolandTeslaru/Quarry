// Must stay first: modules below read env at import time.
import '../load-env';

import { System } from '@quarry/shared/server/system';
import { db, destroyPool } from '@quarry/platform-kernel/db/pool';
import { setServiceLogins } from '@quarry/platform-kernel/db/service-logins';
import { migrateAll } from '@quarry/platform-kernel/db/migrator';
import { MIGRATIONS_FOLDER } from '../migrations-folder';

System.log.setAppName('Migrate');

const log = System.log.withContext('Migrate');

async function main(): Promise<void> {
    await migrateAll(db(), MIGRATIONS_FOLDER);
    await setServiceLogins(db());
    await destroyPool();
}

main().catch((error: unknown) => {
    log.error('Migration failed', { error });
    process.exit(1);
});
