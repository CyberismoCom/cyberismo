import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts*'],
    // test/coalesce.test.ts and test/models.test.ts both pin NODE_CLINGO_MAX_CONCURRENT so
    // they can deterministically force requests to queue -- see vitest.coalesce.config.ts
    // for why that needs its own `vitest run` invocation (a separate process), not just its
    // own describe block here.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'test/coalesce.test.ts',
      'test/models.test.ts',
    ],
    globals: true,
    environment: 'node',
  },
});
