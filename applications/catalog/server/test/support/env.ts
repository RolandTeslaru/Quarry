// Every test file's first setup: decorator metadata, then the test database and Redis.
import 'reflect-metadata';
import { useTestEnv } from '@quarry/platform-kernel/testing/test-env';

useTestEnv();
