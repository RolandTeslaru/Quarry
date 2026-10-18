// Must stay first: modules below read env at import time.
import '../load-env';

import { db, destroyPool } from './pool';
import { migrateAll } from './migrator';

async function main(): Promise<void> {
    await migrateAll(db());
    await destroyPool();
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
