// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import promisePlugin from 'eslint-plugin-promise';

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
];

// simple-git is reached through createGit (data-handler's infra/git/git-config),
// which turns symlinks off for every working tree git writes.
export const NO_SIMPLE_GIT = {
  group: ['simple-git'],
  message: 'Use createGit from @cyberismo/data-handler instead of simple-git.',
};

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
      'no-restricted-imports': ['error', { patterns: [NO_SIMPLE_GIT] }],
    },
  },
  // Tests drive real repositories directly.
  {
    files: ['**/test/**/*.ts', '**/__tests__/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
];

/**
 * Default export for root-level linting
 */
export default baseConfig;
