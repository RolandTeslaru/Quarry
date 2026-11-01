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
            { find: /^@quarry\/platform-kernel\/(.*)$/, replacement: path.resolve(__dirname, '../kernel/$1') },
            // The paused Code Workspaces still call Catalog and Forge in-process (architecture-split.md, phase 1).
            { find: /^@quarry\/catalog-server\/(.*)$/, replacement: path.resolve(__dirname, '../../applications/catalog/server/src/$1') },
            // The architecture tests scan every service's modules.
            { find: /^@quarry\/data-connection-server\/(.*)$/, replacement: path.resolve(__dirname, '../../applications/data-connection/server/src/$1') },
            { find: /^@quarry\/forge-server\/(.*)$/, replacement: path.resolve(__dirname, '../../applications/forge/server/src/$1') },
            { find: /^@quarry\/shared\/(.*)$/,       replacement: path.resolve(__dirname, '../../libraries/shared/$1') },
            { find: /^@quarry\/integrations\/(.*)$/, replacement: path.resolve(__dirname, '../../libraries/integrations/$1') },
        ],
    },
    test: {
        include:         ['src/**/*.test.ts', 'test/**/*.test.ts'],
        // Paused by the split (docs/design/architecture-split.md): Code Workspaces are out of the main server
        // until they come back as a service, their tests with them — and the ForgeAgent's end to end, which builds their code.
        exclude:         ['test/code-workspace/**', 'test/e2e/forge-agent.e2e.test.ts', '**/node_modules/**'],
        globalSetup:     ['test/support/global-setup.ts'],
        setupFiles:      ['test/support/env.ts'],
        fileParallelism: false,             // one test database: files run one after another
        testTimeout:     30_000,
        hookTimeout:     60_000,
    },
});
