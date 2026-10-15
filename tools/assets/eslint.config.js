// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { baseConfig } from '../../eslint.config.js';

export default [
  {
    // CC0 scaffolding: licensed in REUSE.toml, no in-file header.
    ignores: [
      'src/static/defaultReport/**',
      'src/static/defaultGraphView/**',
      'src/static/defaultSkill/**',
      'src/static/agentSkills/**',
    ],
  },
  ...baseConfig,
  {
    files: ['scripts/**/*.js'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
];
