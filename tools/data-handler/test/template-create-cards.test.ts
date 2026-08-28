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

// testing
import { expect, describe, it, beforeEach, afterEach } from 'vitest';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import { getTestProject } from './helpers/test-utils.js';
import { readJsonFile } from '../src/utils/json.js';
import { Template } from '../src/containers/template.js';

import type { Project } from '../src/containers/project.js';

// Create test artifacts in a temp directory.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-template-create-cards-tests');

let project: Project;
let decisionRecordsPath: string;

// Each test gets a pristine project: these tests assert on the template's
// own on-disk and cached state, which earlier tests would otherwise perturb.
beforeEach(async () => {
  mkdirSync(testDir, { recursive: true });
  await copyDir('test/test-data/', testDir);
  decisionRecordsPath = join(testDir, 'valid/decision-records');
  project = getTestProject(decisionRecordsPath);
  await project.populateCaches();
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function templateOf(name: string): Template {
  return new Template(project, { name, path: '' });
}

describe('Template.createCards', () => {
  it('does not change the template cards when instantiating a template twice', async () => {
    const template = templateOf('decision/templates/simplepage');

    const before = template.cards().map((card) => ({
      key: card.key,
      path: card.path,
      rank: card.metadata?.rank,
    }));
    expect(before.length).toBeGreaterThan(0);

    const ranksOnDisk = async () =>
      Object.fromEntries(
        await Promise.all(
          before.map(async (card) => [
            card.key,
            (await readJsonFile(join(card.path, 'index.json'))).rank,
          ]),
        ),
      );

    const diskBefore = await ranksOnDisk();

    await template.createCards();
    await template.createCards();

    const after = template.cards().map((card) => ({
      key: card.key,
      path: card.path,
      rank: card.metadata?.rank,
    }));

    // The cache must still hold the template's own ranks, not the ranks
    // allocated for the instantiated project cards.
    expect(after).to.deep.equal(before);
    // And the cache must still agree with disk, which nothing rewrote.
    expect(await ranksOnDisk()).to.deep.equal(diskBefore);
  });
});
