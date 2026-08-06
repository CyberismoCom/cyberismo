import { defineConfig } from 'vite-plus';

// https://vite.dev/config/
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts*'],
    globals: true,
    environment: 'node',
  },
});
