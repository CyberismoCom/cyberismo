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

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { expectRefused, metadataOf, projects } from '../cards/fixture.js';

const open = projects();

// A project whose template has the one card an import row instantiates.
const spec = {
  fieldTypes: [{ name: 'responsible', dataType: 'shortText' }],
  cardTypes: [{ name: 'page', customFields: [{ name: 'responsible' }] }],
  templates: [{ name: 'tpl', cards: [{ labels: ['from-template'] }] }],
  cards: [{ title: 'Parent' }],
};
const RESPONSIBLE = 'test/fieldTypes/responsible';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
});
function csvFile(content: string) {
  const dir = mkdtempSync(join(tmpdir(), 'import-csv-'));
  dirs.push(dir);
  const file = join(dir, 'cards.csv');
  writeFileSync(file, content);
  return file;
}
const fixture = (name: string) =>
  join(import.meta.dirname, '../test-data', name);
// valid-real.csv, with its template column pointing at this spec's template.
const rows = () =>
  csvFile(
    [
      `title,template,description,labels,${RESPONSIBLE},doesnotexist`,
      'Title1,test/templates/tpl,content1,label-first label-second,a@b.fi,x',
      'Title2,test/templates/tpl,content2,,,x',
    ].join('\n'),
  );

describe('importCmd.importCsv', () => {
  it('creates a card per row from the template, with the row values', async () => {
    const { ws } = await open(spec);

    const [key1, key2] = await ws.importCmd.importCsv(rows());

    const [card1, card2] = await Promise.all(
      [key1, key2].map((key) => ws.cards.details(key)),
    );
    expect(card1.metadata).toMatchObject({
      title: 'Title1',
      labels: ['from-template', 'label-first', 'label-second'],
      [RESPONSIBLE]: 'a@b.fi',
    });
    expect(card1.content).toBe('content1');
    // No labels in the row: the template's stay.
    expect(card2.metadata).toMatchObject({
      title: 'Title2',
      labels: ['from-template'],
    });
    expect(card2.content).toBe('content2');
    // A column that is not a field of the card type is dropped.
    expect(await metadataOf(ws, key1)).not.toHaveProperty('doesnotexist');
  });

  it('creates the cards under the given parent card', async () => {
    const { ws, keys } = await open(spec);

    const created = await ws.importCmd.importCsv(rows(), keys[0]);

    expect(created).toHaveLength(2);
    expect((await ws.cards.details(keys[0])).children).toEqual(
      expect.arrayContaining(created),
    );
  });

  it.each([
    [
      'a csv without the required columns',
      fixture('invalid-missing-columns-real.csv'),
      /must have required property 'template'/,
    ],
    ['a file that does not exist', 'missing.csv', /ENOENT/],
  ])('refuses %s and changes nothing', async (_name, file, error) => {
    const { ws, path } = await open(spec);

    await expectRefused(path, () => ws.importCmd.importCsv(file), error);
  });
});
