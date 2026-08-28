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
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import { getTestProject } from './helpers/test-utils.js';
import { readJsonFile } from '../src/utils/json.js';
import { CardNameRegEx } from '../src/interfaces/project-interfaces.js';
import { CardNotFoundError } from '../src/exceptions/index.js';
import { Template } from '../src/containers/template.js';

import type { Project } from '../src/containers/project.js';

// Create test artifacts in a temp directory.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-template-create-cards-tests');

const ATTACHMENT = 'needle.png';

let project: Project;
let decisionRecordsPath: string;
let simplepageCardsFolder: string;
let attachedCardFolder: string;

// Each test gets a pristine project: these tests assert on the template's
// own on-disk and cached state, which earlier tests would otherwise perturb.
//
// The 'simplepage' template is given an attachment (the fixture ships none)
// so the attachment half of instantiation is exercised on a template that
// also has cards without attachments.
beforeEach(async () => {
  mkdirSync(testDir, { recursive: true });
  await copyDir('test/test-data/', testDir);
  decisionRecordsPath = join(testDir, 'valid/decision-records');
  simplepageCardsFolder = join(
    decisionRecordsPath,
    '.cards/local/templates/simplepage/c',
  );
  attachedCardFolder = join(simplepageCardsFolder, 'decision_2');

  await mkdir(join(attachedCardFolder, 'a'), { recursive: true });
  await writeFile(
    join(attachedCardFolder, 'a', ATTACHMENT),
    'not-really-a-png',
  );
  await writeFile(
    join(attachedCardFolder, 'index.adoc'),
    `= Simple Page\n\nimage::${ATTACHMENT}[]\n`,
  );

  project = getTestProject(decisionRecordsPath);
  await project.populateCaches();
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function templateOf(name: string): Template {
  return new Template(project, { name, path: '' });
}

// Card folders directly under cardRoot, by key.
async function cardRootKeys(): Promise<string[]> {
  const entries = await readdir(project.paths.cardRootFolder, {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isDirectory() && CardNameRegEx.test(entry.name))
    .map((entry) => entry.name)
    .sort();
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

  it('surfaces the original error and leaves no partial cards when a write fails', async () => {
    const template = templateOf('decision/templates/simplepage');
    expect(template.cards().length).toBe(3);

    const keysBefore = await cardRootKeys();

    // Remove the attachment source after the cache has been populated: the
    // copyFile in the middle of the fan-out now fails, while the template's
    // other two cards are written successfully.
    await rm(join(attachedCardFolder, 'a', ATTACHMENT));

    const error = await template.createCards().then(
      () => undefined,
      (reason: unknown) => reason as Error,
    );

    // Nothing the failed operation began writing may survive it.
    expect(await cardRootKeys()).to.deep.equal(keysBefore);

    // The failure that reaches the caller must be the copy failure, not a
    // CardNotFoundError raised by the compensation for a card it never cached.
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(CardNotFoundError);
    expect(error!.message).toMatch(/ENOENT/);
  });
});
