import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globals: true,
    environment: 'node',
    // Generating fixtures scales projects which can take a while.
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
