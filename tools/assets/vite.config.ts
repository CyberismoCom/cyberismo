import { defineConfig } from 'vite-plus';

export default defineConfig({
  run: {
    tasks: {
      // Defined here rather than in package.json so the paths this task both
      // reads and writes can be excluded from fingerprinting, which would
      // otherwise make it uncacheable:
      //  - src/schemas.ts is generated then formatted; it is a pure function of
      //    src/schema/**, which is still tracked, so excluding it is safe.
      //  - shx's `cp` probes each destination with existsSync before writing,
      //    which counts as a read of its own output.
      build: {
        command:
          'shx mkdir -p dist && pnpm script:schemas && node scripts/build.js && tsc && shx cp -r src/static dist/',
        input: [
          { auto: true },
          '!dist/**',
          '!src/schemas.ts',
          '!**/*.tsbuildinfo',
        ],
        output: [{ auto: true }, '!**/*.tsbuildinfo'],
      },
    },
  },
});
