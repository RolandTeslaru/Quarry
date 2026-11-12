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
            // The architecture tests scan every service's modules.
            { find: /^@quarry\/catalog-microservice\/(.*)$/, replacement: path.resolve(__dirname, '../../applications/catalog/microservice/src/$1') },
            { find: /^@quarry\/data-connection-microservice\/(.*)$/, replacement: path.resolve(__dirname, '../../applications/data-connection/microservice/src/$1') },
            { find: /^@quarry\/forge-microservice\/(.*)$/, replacement: path.resolve(__dirname, '../../applications/forge/microservice/src/$1') },
            { find: /^@quarry\/code-workspace-microservice\/(.*)$/, replacement: path.resolve(__dirname, '../../applications/code-workspace/microservice/src/$1') },
            { find: /^@quarry\/lineage-explorer-microservice\/(.*)$/, replacement: path.resolve(__dirname, '../../applications/lineage-explorer/microservice/src/$1') },
            { find: /^@quarry\/ontology-microservice\/(.*)$/, replacement: path.resolve(__dirname, '../../applications/ontology/microservice/src/$1') },
            { find: /^@quarry\/shared\/(.*)$/,       replacement: path.resolve(__dirname, '../../libraries/shared/$1') },
            { find: /^@quarry\/integrations\/(.*)$/, replacement: path.resolve(__dirname, '../../libraries/integrations/$1') },
        ],
    },
    test: {
        include:         ['src/**/*.test.ts', 'test/**/*.test.ts'],
        globalSetup:     ['test/support/global-setup.ts'],
        setupFiles:      ['test/support/env.ts'],
        fileParallelism: false,             // one test database: files run one after another
        testTimeout:     30_000,
        hookTimeout:     60_000,
    },
});
