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
import { afterEach, beforeEach, expect, it } from 'vitest';

import type { Workspace } from '../../src/workspace/workspace.js';
import { copyDir } from '../../src/utils/file-utils.js';
import { openTestWorkspace } from '../helpers/open-test-workspace.js';
import { getTestBaseDir } from '../helpers/test-utils.js';

const baseDir = getTestBaseDir(import.meta.dirname, import.meta.url);
const testDir = join(baseDir, 'tmp-workspace-resources-tests');

let ws: Workspace;

beforeEach(async () => {
  mkdirSync(testDir, { recursive: true });
  await copyDir('test/test-data/', testDir);
  ws = await openTestWorkspace(join(testDir, 'valid/decision-records'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// Sets the field at `path` in a read result.
function overwrite(shown: unknown, path: (string | number)[]) {
  const parent = path
    .slice(0, -1)
    .reduce((at, key) => (at as Record<string | number, unknown>)[key], shown);
  (parent as Record<string | number, unknown>)[path.at(-1)!] = 'Mine';
}

// Mutating what a read returns, nested parts included, leaves the next read
// unchanged.
it.each([
  {
    read: 'resources.show: a file resource',
    get: () => ws.resources.show('decision/cardTypes/decision'),
    path: ['displayName'],
  },
  {
    read: 'resources.show: a folder resource, nested content',
    get: () => ws.resources.show('decision/reports/testReport'),
    path: ['content', 'contentTemplate'],
  },
  {
    read: 'resources.contents: card types',
    get: () => ws.resources.contents('cardTypes'),
    path: [0, 'displayName'],
  },
  {
    read: 'resources.contents: workflows',
    get: () => ws.resources.contents('workflows'),
    path: [0, 'displayName'],
  },
])('$read returns a copy', async ({ get, path }) => {
  const before = structuredClone(await get());
  overwrite(await get(), path);
  expect(await get()).toEqual(before);
});
