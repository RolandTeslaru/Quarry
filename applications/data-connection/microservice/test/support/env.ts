// Every test file's first setup: decorator metadata, the test database and Redis, and where the
// main server, Catalog and Forge the global setup started are.
import 'reflect-metadata';
import { inject } from 'vitest';
import { useTestEnv } from '@quarry/platform-kernel/testing/test-env';

useTestEnv();

process.env.QUARRY_SERVER_URL = inject('serverUrl');
process.env.CATALOG_URL = inject('catalogUrl');
process.env.FORGE_URL = inject('forgeUrl');
process.env.DATA_CONNECTION_URL = inject('dataConnectionUrl');
