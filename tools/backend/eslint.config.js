import { nodeConfig } from '../../eslint.config.js';

export default [
  ...nodeConfig,
  {
    ignores: ['vitest.config.ts'],
  },
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
