/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { afterEach, expect, test } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ProjectRegistry } from '../src/project-registry.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';

let tempPath: string | undefined;

afterEach(async () => {
  if (tempPath) await cleanupTempTestData(tempPath);
  tempPath = undefined;
});

test('a project that fails to load is named in the error', async () => {
  tempPath = await createTempTestData('minimal');
  await writeFile(
    join(tempPath, '.cards/local/workflows/minimal.json'),
    '{ not json',
  );

  await expect(
    ProjectRegistry.fromScannedProjects([
      { path: tempPath, prefix: 'mini', name: 'minimal' },
    ]),
  ).rejects.toThrow(`Failed to load project 'mini' (${tempPath}):`);
});
