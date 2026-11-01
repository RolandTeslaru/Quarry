import * as path from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * The Catalog service's tests, against a real Postgres and Redis — on the service's own database
 * login (test/support/catalog-fixtures.ts). The schema is the main server's migrations.
 * SWC compiles, so Nest's decorator metadata is emitted (esbuild doesn't).
 */
export default defineConfig({
    plugins: [swc.vite({ module: { type: 'es6' } })],
    resolve: {
        alias: [
            { find: /^@quarry\/catalog-server\/(.*)$/,  replacement: path.resolve(__dirname, 'src/$1') },
            { find: /^@quarry\/platform-kernel\/(.*)$/,  replacement: path.resolve(__dirname, '../../../platform/kernel/$1') },
            { find: /^@quarry\/shared\/(.*)$/,           replacement: path.resolve(__dirname, '../../../libraries/shared/$1') },
            { find: /^@quarry\/integrations\/(.*)$/,     replacement: path.resolve(__dirname, '../../../libraries/integrations/$1') },
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
