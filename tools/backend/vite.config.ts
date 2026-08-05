import { defineConfig } from 'vite-plus';

export default defineConfig({
  run: {
    tasks: {
      // Defined here rather than in package.json so dist/ can be excluded from
      // input fingerprinting: shx's `cp` probes each destination with
      // existsSync before writing, which counts as reading its own output and
      // makes the task uncacheable.
      build: {
        command:
          'tsc -p tsconfig.build.json && shx rm -rf ./dist/public && shx cp -r ../app/dist ./dist/public',
        input: [{ auto: true }, '!dist/**', '!**/*.tsbuildinfo'],
        output: [{ auto: true }, '!**/*.tsbuildinfo'],
      },
    },
  },
});
