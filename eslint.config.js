import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import promisePlugin from 'eslint-plugin-promise';
import header from '@tony.ganchev/eslint-plugin-header';

/**
 * Base configuration shared across all projects
 */
export const baseConfig = [
  {
    ignores: [
      '**/dist/*',
      '**/init.js',
      '**/coverage/*',
      '**/node_modules/*',
      'eslint.config.js',
      'eslint.config.mjs',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    plugins: { '@tony.ganchev': header },
    rules: {
      '@tony.ganchev/header': [
        'error',
        {
          header: {
            commentType: 'line',
            lines: [
              ' SPDX-FileCopyrightText: Cyberismo Ltd and contributors',
              ' SPDX-License-Identifier: AGPL-3.0-only',
            ],
          },
          // A blank line after the header (scripts/check-headers.mjs writes one).
          trailingEmptyLines: { minimum: 2 },
        },
      ],
    },
  },
];

/**
 * Configuration for Node.js projects (backend, CLI tools, libraries)
 */
export const nodeConfig = [
  ...baseConfig,
  promisePlugin.configs['flat/recommended'],
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'promise/catch-or-return': 'error',
      'promise/no-promise-in-callback': 'error',
      'promise/always-return': 'off',
    },
  },
];

/**
 * Default export for root-level linting
 */
export default baseConfig;
