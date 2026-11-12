// Every test file's first setup: decorator metadata, the test database and Redis, and where the main
// server, Catalog and this service the global setup started are.
import 'reflect-metadata';
import { inject } from 'vitest';
import { useTestEnv } from '@quarry/platform-kernel/testing/test-env';

useTestEnv();

process.env.QUARRY_SERVER_URL = inject('serverUrl');
process.env.CATALOG_URL = inject('catalogUrl');
