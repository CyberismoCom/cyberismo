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

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DHValidationError } from '../../src/exceptions/index.js';
import type { Workspace } from '../../src/workspace/workspace.js';
import { copyDir } from '../../src/utils/file-utils.js';
import { openTestWorkspace } from '../helpers/open-test-workspace.js';
import { getTestBaseDir } from '../helpers/test-utils.js';

const baseDir = getTestBaseDir(import.meta.dirname, import.meta.url);
const testDir = join(baseDir, 'tmp-workspace-queries-tests');

let ws: Workspace;

beforeAll(async () => {
  mkdirSync(testDir, { recursive: true });
  await copyDir('test/test-data/', testDir);
  ws = await openTestWorkspace(join(testDir, 'valid/decision-records'));
});

afterAll(() => {
  ws.checkout.dispose();
  rmSync(testDir, { recursive: true, force: true });
});

describe('queries.program', () => {
  it('puts a named query before the whole program', async () => {
    const whole = await ws.queries.program();
    const withQuery = await ws.queries.program('tree');
    expect(withQuery.length).toBeGreaterThan(whole.length);
    expect(withQuery.endsWith(whole)).toBe(true);
  });

  it('refuses a query it does not know', async () => {
    const program = ws.queries.program('bogus');
    await expect(program).rejects.toThrow(
      "Unknown query 'bogus'. Must be one of: card, connectors, enabledSkills, onCreation, onTransition, tree",
    );
    await expect(program).rejects.toBeInstanceOf(DHValidationError);
  });
});
