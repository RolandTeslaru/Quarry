import { defineConfig } from 'vitest/config';

/** The runtime started from source and driven over stdio, as its callers drive it. Needs the transforms package's .venv. */
export default defineConfig({
    test: {
        include:     ['test/**/*.test.ts'],
        testTimeout: 60_000,
        hookTimeout: 60_000,
    },
});
