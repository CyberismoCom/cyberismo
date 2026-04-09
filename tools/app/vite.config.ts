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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: process.env.VITE_HOST === 'true' ? true : undefined,
    proxy:
      process.env.VITE_CYBERISMO_EXPORT === 'true'
        ? undefined
        : {
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
