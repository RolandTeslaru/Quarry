// Every test file's first setup: decorator metadata, the test database and Redis, and where the
// main server, Catalog and Forge the global setup started are — and where this service listens when a test serves it.
import 'reflect-metadata';
import { inject } from 'vitest';
import { useTestEnv } from '@quarry/platform-kernel/testing/test-env';

useTestEnv();

process.env.QUARRY_SERVER_URL = inject('serverUrl');
process.env.CATALOG_URL = inject('catalogUrl');
process.env.FORGE_URL = inject('forgeUrl');
process.env.CODE_WORKSPACE_URL = inject('codeWorkspaceUrl');
