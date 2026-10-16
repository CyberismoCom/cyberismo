// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { defineConfig } from 'vitest/config';

// Against a globally installed CLI the workspace packages may be unbuilt, so
// only the binary smoke test can run.
const binaryTests = ['test/cli.test.ts'];

export default defineConfig({
  test: process.env.CYBERISMO_GLOBAL_CLI ? { include: binaryTests } : {},
});
