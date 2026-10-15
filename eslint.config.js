// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import promisePlugin from 'eslint-plugin-promise';
import spdxHeader from './eslint-rules/spdx-header.js';

// Single source of truth for the in-file licence header.
export const SPDX_COPYRIGHT = 'Cyberismo Ltd and contributors';
export const SPDX_LICENSE = 'AGPL-3.0-only';

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
    // The "No in-file header zones" of REUSE.toml, relative to the repository
    // root or to the package being linted. Keep in sync with REUSE.toml.
    // Vendored third-party code is ignored as well.
    ignores: ['docs/**', 'module-test/**', 'test/test-data/**', 'external/**'],
    plugins: { cyberismo: { rules: { 'spdx-header': spdxHeader } } },
    rules: {
      'cyberismo/spdx-header': [
        'error',
        { copyright: SPDX_COPYRIGHT, license: SPDX_LICENSE },
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
