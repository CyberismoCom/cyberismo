import { baseConfig } from '../../eslint.config.js';

export default [
  { ignores: ['external/'] },
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
