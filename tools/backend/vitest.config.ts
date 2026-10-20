import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    globals: true,
    environment: 'node',
  },
});
