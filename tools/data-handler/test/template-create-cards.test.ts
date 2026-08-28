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

function templateOf(name: string): TemplateResource {
  return project.resources.byType(name, 'templates');
}

// Instantiates the template and returns the key of the card created from
// the template card that carries the attachment.
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

    // The cache must still hold the template's own ranks, not the ranks
    // allocated for the instantiated project cards.
    expect(after).to.deep.equal(before);
    // And the cache must still agree with disk, which nothing rewrote.
    expect(await ranksOnDisk()).to.deep.equal(diskBefore);
  });

  it('surfaces the original error and leaves no partial cards when a write fails', async () => {
    const template = templateOf('decision/templates/simplepage');
    expect(template.templateCards().length).toBe(3);

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

  // Compensation deletes the nodes this operation created and nothing else.
  // Under a parent card that means the cards inside the parent's 'c' folder,
  // not the parent, and not the folder itself if the parent has other
  // children.
  it('deletes only what it created when instantiating under a parent card', async () => {
    const template = templateOf('decision/templates/simplepage');
    const parentCard = project.findCard('decision_5');
    const childrenBefore = parentCard.children;
    expect(childrenBefore.length).toBeGreaterThan(0);

    await rm(join(attachedCardFolder, 'a', ATTACHMENT));

    await expect(template.createCards(parentCard)).rejects.toThrow(/ENOENT/);

    // The parent and its existing children are untouched.
    const parentAfter = project.findCard('decision_5');
    expect(parentAfter.children).to.deep.equal(childrenBefore);
    for (const childKey of childrenBefore) {
      expect(
        await readJsonFile(join(parentAfter.path, 'c', childKey, 'index.json')),
      ).toBeDefined();
    }
    // And no card folder the failed operation began writing survives.
    const remaining = (
      await readdir(join(parentAfter.path, 'c'), { withFileTypes: true })
    )
      .filter((entry) => entry.isDirectory() && CardNameRegEx.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    expect(remaining).to.deep.equal([...childrenBefore].sort());
  });

  it('caches the content it actually wrote', async () => {
    const template = templateOf('decision/templates/simplepage');

    const cached = project.findCard(await instantiateAttachedCard(template));

    // The cached content must be the content that was written, with the
    // attachment reference already renamed.
    const contentOnDisk = await readFile(
      join(cached.path, 'index.adoc'),
      'utf-8',
    );
    expect(cached.content).toContain(`image::${cached.key}-${ATTACHMENT}[]`);
    expect(cached.content).toBe(contentOnDisk);
  });

  // Instantiation is a create, not a copy: the field-transfer list in
  // TemplateResource.instantiate / instantiatedMetadata is the specification
  // of what an instantiated card is, and this pins it. A field that used to
  // arrive by being spread in from the template card - links and
  // lastTransitioned, both of them meaningless on a fresh card - is now
  // absent because nothing puts it there.
  it('builds instantiated metadata from the field-transfer list', async () => {
    const templateCardFolder = join(
      decisionRecordsPath,
      '.cards/local/templates/decision/c/decision_1',
    );
    const templateCardFile = join(templateCardFolder, 'index.json');
    const templateMetadata = (await readJsonFile(templateCardFile)) as Record<
      string,
      unknown
    >;

    // Everything instantiation has to make a decision about, on one template
    // card: a card-to-card link, a transition stamp, an authored custom-field
    // value next to the null ones the fixture already has, and a title.
    await writeFile(
      templateCardFile,
      JSON.stringify({
        ...templateMetadata,
        title: 'Template title',
        links: [
          {
            linkType: 'decision/linkTypes/test',
            cardKey: 'decision_1',
            linkDescription: 'points at a template card',
          },
        ],
        lastTransitioned: '2020-01-01T00:00:00.000Z',
        'decision/fieldTypes/commitDescription': 'authored in the template',
      }),
    );

    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const template: TemplateResource = project.resources.byType(
      'decision/templates/decision',
      'templates',
    );

    const before = Date.now();
    const [created] = await template.createCards();
    const metadata = created.metadata as Record<string, unknown>;

    expect(Object.keys(metadata).sort()).toEqual([
      'cardType',
      'createdAt',
      'decision/fieldTypes/commitDescription',
      'labels',
      // Stamped by the write itself, not by instantiation.
      'lastUpdated',
      'links',
      'rank',
      'templateCardKey',
      'title',
      'workflowState',
    ]);

    // Carried from the template card.
    expect(metadata.title).toBe('Template title');
    expect(metadata.cardType).toBe('decision/cardTypes/decision');
    expect(metadata.labels).toEqual(['template-test-label']);
    expect(metadata['decision/fieldTypes/commitDescription']).toBe(
      'authored in the template',
    );

    // Set by the operation.
    expect(metadata.templateCardKey).toBe('decision_1');

    // Computed by the destination.
    expect(metadata.workflowState).toBe('Draft');
    expect(metadata.rank).toMatch(/^0\|[a-z]+$/);
    expect(
      new Date(metadata.createdAt as string).getTime(),
    ).toBeGreaterThanOrEqual(before);

    // Dropped. A template card's links name template card keys, so a carried
    // link points at a card that is not part of the instantiated set;
    // lastTransitioned describes a transition that has not happened.
    expect(metadata.links).toEqual([]);
    expect('lastTransitioned' in metadata).toBe(false);

    // A null custom-field value is the template's 'no value' marker, so the
    // slot is absent rather than null.
    expect('decision/fieldTypes/admins' in metadata).toBe(false);

    // And nothing of this touched the template card.
    expect(await readJsonFile(templateCardFile)).toMatchObject({
      links: [
        {
          linkType: 'decision/linkTypes/test',
          cardKey: 'decision_1',
        },
      ],
      lastTransitioned: '2020-01-01T00:00:00.000Z',
    });
  });

  it('caches the attachments it actually wrote', async () => {
    const template = templateOf('decision/templates/simplepage');

    const cached = project.findCard(await instantiateAttachedCard(template));
    const expectedFileName = `${cached.key}-${ATTACHMENT}`;
    const expectedFolder = join(cached.path, 'a');

    // The cached attachment must describe the copy under the new card, not
    // the template file it was copied from.
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
