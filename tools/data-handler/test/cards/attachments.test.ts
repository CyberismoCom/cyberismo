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

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ReadOnlyContainerError } from '../../src/shared/exceptions/index.js';
import type { Workspace } from '../../src/api/workspace/workspace.js';
import { expectRefused, projects, readOnlyModule } from './fixture.js';

const open = projects();

const spec = {
  cards: [{}, {}],
  templates: [{ name: 'tpl', cards: [{}] }],
  modules: [readOnlyModule()],
};
const text = (value: string) => Buffer.from(value);

// A project whose first card already has a.txt and b.txt.
async function withAttachments() {
  const project = await open(spec);
  const [card] = project.keys;
  await project.cards.addAttachment(card, 'b.txt', text('bee'));
  await project.cards.addAttachment(card, 'a.txt', text('ay'));
  return { ...project, card };
}
const names = async (ws: Workspace) =>
  (await ws.cards.attachments()).map((a) => `${a.card}/${a.fileName}`);

describe('card attachments', () => {
  it('adds data under a name, listing it and reading it back with its type', async () => {
    const { ws, path, keys } = await open(spec);

    await ws.cards.addAttachment(keys[0], 'pic.png', text('png-bytes'));

    expect(
      readFileSync(join(path, 'cardRoot', keys[0], 'a', 'pic.png'), 'utf-8'),
    ).toBe('png-bytes');
    expect(await ws.cards.attachments()).toEqual([
      expect.objectContaining({
        card: keys[0],
        fileName: 'pic.png',
        mimeType: 'image/png',
      }),
    ]);
    const content = await ws.cards.attachment(keys[0], 'pic.png');
    expect(content.mimeType).toBe('image/png');
    expect(content.fileBuffer.toString()).toBe('png-bytes');
  });

  it('adds a file from a path under its own name', async () => {
    const { ws, path, keys } = await open(spec);
    const source = join(path, 'note.txt'); // inside the project's tmp dir, cleaned with it
    writeFileSync(source, 'from disk');

    await ws.cards.addAttachment(keys[0], source, readFileSync(source));

    expect(
      readFileSync(join(path, 'cardRoot', keys[0], 'a', 'note.txt'), 'utf-8'),
    ).toBe('from disk');
    expect(await names(ws)).toEqual([`${keys[0]}/note.txt`]);
  });

  it('lists the attachments of project and template cards, sorted by card then file', async () => {
    const { ws, keys, templateKeys } = await open(spec);
    const [template] = templateKeys['test/templates/tpl'];
    await ws.cards.addAttachment(keys[1], 'z.txt', text('z'));
    await ws.cards.addAttachment(template, 'm.txt', text('m'));
    await ws.cards.addAttachment(keys[0], 'b.txt', text('b'));
    await ws.cards.addAttachment(keys[0], 'a.txt', text('a'));

    expect(await names(ws)).toEqual(
      [
        `${keys[0]}/a.txt`,
        `${keys[0]}/b.txt`,
        `${keys[1]}/z.txt`,
        `${template}/m.txt`,
      ].sort(),
    );
  });

  it('removes an attachment, file and listing, keeping the others', async () => {
    const { ws, path, card } = await withAttachments();

    await ws.cards.removeAttachment(card, 'a.txt');

    expect(existsSync(join(path, 'cardRoot', card, 'a', 'a.txt'))).toBe(false);
    expect(await names(ws)).toEqual([`${card}/b.txt`]);
  });

  it('renames an attachment, keeping its content', async () => {
    const { ws, path, card } = await withAttachments();

    await ws.cards.renameAttachment(card, 'a.txt', 'c.txt');

    expect(existsSync(join(path, 'cardRoot', card, 'a', 'a.txt'))).toBe(false);
    expect(
      (await ws.cards.attachment(card, 'c.txt')).fileBuffer.toString(),
    ).toBe('ay');
    expect(await names(ws)).toEqual([`${card}/b.txt`, `${card}/c.txt`]);
  });

  it.each([
    // Pins today's behaviour: addAttachment loses the CardNotFoundError, leaving a message.
    [
      'adding to a missing card',
      (c: Workspace['cards']) =>
        c.addAttachment('test_zzzzzzzz', 'x.txt', text('x')),
      /test_zzzzzzzz/,
    ],
    [
      'adding a name the card has',
      (c, k) => c.addAttachment(k, 'a.txt', text('x')),
      /a\.txt/,
    ],
    [
      'adding to an imported template card',
      (c, _k, t) =>
        c.addAttachment(t['mod/templates/mt'][0], 'x.txt', text('x')),
      /Cannot modify imported module/,
    ],
    [
      'removing an attachment the card lacks',
      (c, k) => c.removeAttachment(k, 'nope.txt'),
      /nope\.txt/,
    ],
    [
      'removing from an imported template card',
      (c, _k, t) => c.removeAttachment(t['mod/templates/mt'][0], 'x.txt'),
      ReadOnlyContainerError,
    ],
    [
      'removing without a file name',
      (c, k) => c.removeAttachment(k),
      /Attachment filename required/,
    ],
    [
      'renaming one the card lacks',
      (c, k) => c.renameAttachment(k, 'nope.txt', 'x.txt'),
      /nope\.txt/,
    ],
    [
      'renaming onto an existing name',
      (c, k) => c.renameAttachment(k, 'a.txt', 'b.txt'),
      /b\.txt/,
    ],
    [
      'reading one the card lacks',
      (c, k) => c.attachment(k, 'nope.txt'),
      /Attachment 'nope.txt' not found/,
    ],
    [
      'reading without a card',
      (c) => c.attachment('', 'a.txt'),
      /Mandatory parameter 'cardKey'/,
    ],
  ] as [
    string,
    (
      c: Workspace['cards'],
      card: string,
      t: Record<string, string[]>,
    ) => Promise<unknown>,
    RegExp | (new (...args: never[]) => Error),
  ][])('refuses %s', async (_name, operation, error) => {
    const { cards, path, card, templateKeys } = await withAttachments();

    await expectRefused(
      path,
      () => operation(cards, card, templateKeys),
      error,
    );
  });
});
