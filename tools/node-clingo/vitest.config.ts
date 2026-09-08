import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts*'],
    // test/coalesce.test.ts pins NODE_CLINGO_MAX_CONCURRENT so it can deterministically
    // force requests to queue -- see vitest.coalesce.config.ts for why that needs its own
    // `vitest run` invocation (a separate process), not just its own describe block here.
    exclude: ['**/node_modules/**', '**/dist/**', 'test/coalesce.test.ts'],
    globals: true,
    environment: 'node',
    // Gates the native module's `_renameForTest` debug export (see binding.cc's Init()).
    // Must be set before lib/index.ts is first imported, since that is when the native
    // addon loads and decides whether to register it.
    env: {
      NODE_CLINGO_TEST_EXPORTS: '1',
    },
  },
});
