import * as path from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests sit next to their code (`src/**\/*.test.ts`); integration tests,
 * against a real Postgres and Redis, in `test/` (docs/design/testing.md).
 * SWC compiles, so Nest's decorator metadata is emitted (esbuild doesn't).
 */
export default defineConfig({
    plugins: [swc.vite({ module: { type: 'es6' } })],
    resolve: {
        alias: [
            { find: /^@\/(.*)$/,                    replacement: path.resolve(__dirname, 'src/$1') },
            { find: /^@quarry\/platform-server\/(.*)$/, replacement: path.resolve(__dirname, '../platform-server/$1') },
            // The paused products still call Catalog in-process (architecture-split.md, phase 1).
            { find: /^@quarry\/catalog-service\/(.*)$/, replacement: path.resolve(__dirname, '../catalog-service/src/$1') },
            { find: /^@quarry\/shared\/(.*)$/,       replacement: path.resolve(__dirname, '../shared/$1') },
            { find: /^@quarry\/integrations\/(.*)$/, replacement: path.resolve(__dirname, '../integrations/$1') },
        ],
    },
    test: {
        include:         ['src/**/*.test.ts', 'test/**/*.test.ts'],
        // Phase 1 of the split (docs/design/architecture-split.md): Data Connection, Code Workspaces and
        // Forge are out of the main server until they come back as services; their tests with them.
        exclude:         ['test/data-connection/**', 'test/code-workspace/**', 'test/forge/**', 'test/e2e/forge-agent.e2e.test.ts', 'test/e2e/source-probes.e2e.test.ts', '**/node_modules/**'],
        globalSetup:     ['test/support/global-setup.ts'],
        setupFiles:      ['test/support/env.ts'],
        fileParallelism: false,             // one test database: files run one after another
        testTimeout:     30_000,
        hookTimeout:     60_000,
    },
});
