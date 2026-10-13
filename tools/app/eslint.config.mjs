import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { baseConfig } from '../../eslint.config.js';

export default tseslint.config(
  ...baseConfig,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // The app bundle must stay browser-safe: shared types come from
    // @cyberismo/model, never from the Node-only data-handler.
    files: ['src/**/*.{ts,tsx}', '__tests__/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@cyberismo/data-handler',
                '@cyberismo/data-handler/*',
                '**/data-handler/**',
              ],
              message: 'Import shared types from @cyberismo/model.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['e2e/**/*.ts', 'scripts/**/*.js', 'playwright.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-refresh/only-export-components': 'off',
      'no-empty-pattern': 'off',
    },
  },
);
