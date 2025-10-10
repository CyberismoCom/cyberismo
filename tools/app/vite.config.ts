import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import license from 'rollup-plugin-license';
import topLevelAwait from 'vite-plugin-top-level-await';
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
    topLevelAwait(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy:
      process.env.VITE_CYBERISMO_EXPORT === 'true'
        ? undefined
        : {
            '/api': 'http://localhost:3000',
          },
  },
});
