/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { defineConfig } from 'vitest/config';

// Against a globally installed CLI the workspace packages may be unbuilt, so
// only the binary smoke test can run.
const binaryTests = ['test/cli.test.ts'];

export default defineConfig({
  test: process.env.CYBERISMO_GLOBAL_CLI ? { include: binaryTests } : {},
});
