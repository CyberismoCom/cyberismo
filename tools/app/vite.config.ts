import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import license from 'rollup-plugin-license';
import * as path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    license({
      thirdParty: {
        output: {
          file: path.join(__dirname, 'dist', 'THIRD-PARTY.txt'),
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    include: ['__tests__/**/*.test.ts*'],
    setupFiles: './vitest-setup.ts',
    environment: 'jsdom',
    globals: true,
  },
});
