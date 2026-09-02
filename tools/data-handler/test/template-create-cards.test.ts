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
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import { getTestProject } from './helpers/test-utils.js';
import { readJsonFile } from '../src/utils/json.js';
import { CardNameRegEx } from '../src/interfaces/project-interfaces.js';
import { CardNotFoundError } from '../src/exceptions/index.js';
import type { TemplateResource } from '../src/resources/template-resource.js';

import type { Project } from '../src/containers/project.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-template-create-cards-tests');

const ATTACHMENT = 'needle.png';

let project: Project;
let decisionRecordsPath: string;
let attachedCardFolder: string;

beforeEach(async () => {
  mkdirSync(testDir, { recursive: true });
  await copyDir('test/test-data/', testDir);
  decisionRecordsPath = join(testDir, 'valid/decision-records');
  attachedCardFolder = join(
    decisionRecordsPath,
    '.cards/local/templates/simplepage/c/decision_2',
  );

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

function templateOf(name: string): TemplateResource {
  return project.resources.byType(name, 'templates');
}

async function instantiateAttachedCard(
  template: TemplateResource,
): Promise<string> {
  const created = await template.createCards();
  const card = created.find(
    (item) => item.metadata?.templateCardKey === 'decision_2',
  );
  expect(card).toBeDefined();
  return card!.key;
}

async function cardRootKeys(): Promise<string[]> {
  const entries = await readdir(project.paths.cardRootFolder, {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isDirectory() && CardNameRegEx.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

describe('TemplateResource.createCards', () => {
  it('does not change the template cards when instantiating a template twice', async () => {
    const template = templateOf('decision/templates/simplepage');

    const before = template.templateCards().map((card) => ({
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

    const after = template.templateCards().map((card) => ({
      key: card.key,
      path: card.path,
      rank: card.metadata?.rank,
    }));

    expect(after).to.deep.equal(before);
    expect(await ranksOnDisk()).to.deep.equal(diskBefore);
  });

  it('surfaces the original error and leaves no partial cards when a write fails', async () => {
    const template = templateOf('decision/templates/simplepage');
    expect(template.templateCards().length).toBe(3);

    const keysBefore = await cardRootKeys();

    await rm(join(attachedCardFolder, 'a', ATTACHMENT));

    const error = await template.createCards().then(
      () => undefined,
      (reason: unknown) => reason as Error,
    );

    expect(await cardRootKeys()).to.deep.equal(keysBefore);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(CardNotFoundError);
    expect(error!.message).toMatch(/ENOENT/);
  });

  it('caches the content it actually wrote', async () => {
    const template = templateOf('decision/templates/simplepage');

    const cached = project.findCard(await instantiateAttachedCard(template));

    const contentOnDisk = await readFile(
      join(cached.path, 'index.adoc'),
      'utf-8',
    );
    expect(cached.content).toContain(`image::${cached.key}-${ATTACHMENT}[]`);
    expect(cached.content).toBe(contentOnDisk);
  });

  it('caches the attachments it actually wrote', async () => {
    const template = templateOf('decision/templates/simplepage');

    const cached = project.findCard(await instantiateAttachedCard(template));
    const expectedFileName = `${cached.key}-${ATTACHMENT}`;
    const expectedFolder = join(cached.path, 'a');

    expect(cached.attachments).to.deep.equal([
      {
        card: cached.key,
        path: expectedFolder,
        fileName: expectedFileName,
        mimeType: 'image/png',
      },
    ]);
    await expect(
      readFile(join(expectedFolder, expectedFileName), 'utf-8'),
    ).resolves.toBe('not-really-a-png');
  });
});
