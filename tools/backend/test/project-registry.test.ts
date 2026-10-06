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

let tempPaths: string[] = [];

afterEach(async () => {
  for (const path of tempPaths) await cleanupTempTestData(path);
  tempPaths = [];
});

test('a project that fails to load is reported and the others still load', async () => {
  const brokenPath = await createTempTestData('minimal');
  const goodPath = await createTempTestData('decision-records');
  tempPaths = [brokenPath, goodPath];
  await writeFile(
    join(brokenPath, '.cards/local/workflows/minimal.json'),
    '{ not json',
  );

  const { registry, failed } = await ProjectRegistry.fromScannedProjects([
    { path: brokenPath, prefix: 'mini', name: 'minimal' },
    { path: goodPath, prefix: 'decision', name: 'decision-records' },
  ]);

  expect(registry.list().map((p) => p.prefix)).toEqual(['decision']);
  expect(failed).toEqual([
    {
      prefix: 'mini',
      errors: [
        expect.stringContaining(`Failed to load project (${brokenPath}):`),
      ],
    },
  ]);
  registry.dispose();
});
