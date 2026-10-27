import { defineConfig } from 'vitest/config';

/** Unit tests for @quarry/shared, next to the code they test (`**\/*.test.ts`). No infrastructure. */
export default defineConfig({
    test: {
        include: ['**/*.test.ts'],
        exclude: ['node_modules/**', 'dist/**'],
    },
});
