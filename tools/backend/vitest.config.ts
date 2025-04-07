import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts*'],
    globals: true,
    environment: 'node',
  },
});
