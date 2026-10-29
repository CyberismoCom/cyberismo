// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts*'],
    globals: true,
    environment: 'node',
  },
});
