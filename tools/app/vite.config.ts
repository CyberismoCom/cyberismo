import { defineConfig } from 'vite-plus';
import react from '@vitejs/plugin-react';
import license from 'rollup-plugin-license';
import * as path from 'path';
// https://vite.dev/config/
export default defineConfig({
  run: {
    tasks: {
      // Defined here rather than in package.json so the tsc build-info can be
      // excluded from fingerprinting — tsc reads and rewrites it, which would
      // otherwise make the whole task uncacheable.
      build: {
        command: 'tsc -b && vp build',
        input: [{ auto: true }, '!**/*.tsbuildinfo'],
        output: [{ auto: true }, '!**/*.tsbuildinfo'],
      },
    },
  },
  plugins: [
    react(),
    license({
      thirdParty: {
        output: {
          file: path.join(__dirname, 'dist', 'THIRD-PARTY.txt'),
        },
      },
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // CodeMirror validates extensions by class/facet identity, so it breaks
    // (silently — e.g. closeBrackets stops working) if more than one copy of
    // these packages ends up in the bundle. A dependency bump can fork them
    // into two versions; force a single copy here so it can't.
    dedupe: [
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      'style-mod',
    ],
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
