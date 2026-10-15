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

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CardNotFoundError } from '../../../src/shared/exceptions/index.js';
import {
  expectRefused,
  metadataOf,
  projects,
  rootKeys,
  snapshot,
  readOnlyModule,
} from './fixture.js';

const open = projects();

// P(c1, c2), Q, R, Locked. Q links to c1 and R; R links to P and Q.
const spec = {
  linkTypes: [{ name: 'rel' }],
  cards: [
    { title: 'P', children: [{}, {}] },
    {
      links: [
        { linkType: 'rel', to: 1 },
        { linkType: 'rel', to: 4 },
      ],
    },
    {
      links: [
        { linkType: 'rel', to: 0 },
        { linkType: 'rel', to: 3 },
      ],
    },
    { title: 'Locked' },
  ],
  templates: [{ name: 'tpl', cards: [{ title: 'Locked', children: [{}] }] }],
  modules: [readOnlyModule()],
};

describe('cards.remove', () => {
  it('removes the card and its descendants, on disk and in every read', async () => {
    const { ws, path, keys } = await open(spec);
    const [p, c1, c2, q, r] = keys;

    await ws.cards.remove(p);

    expect(existsSync(join(path, 'cardRoot', p))).toBe(false);
    expect([p, c1, c2].map((key) => ws.cards.has(key))).toEqual([
      false,
      false,
      false,
    ]);
    expect(await rootKeys(ws)).toEqual([q, r, keys[5]]);
  });

  it('strips links to removed cards from the survivors and nothing else', async () => {
    const { ws, path, keys } = await open(spec);
    const [p, , , q, r] = keys;
    const untouched = snapshot(path)[join('cardRoot', keys[5], 'index.json')];

    await ws.cards.remove(p);

    expect((await metadataOf(ws, q)).links.map((link) => link.cardKey)).toEqual(
      [r],
    );
    expect((await metadataOf(ws, r)).links.map((link) => link.cardKey)).toEqual(
      [q],
    );
    expect(snapshot(path)[join('cardRoot', keys[5], 'index.json')]).toBe(
      untouched,
    );
  });

  it('removes a template card with its descendants', async () => {
    const { ws, templateKeys } = await open(spec);
    const [parent, child] = templateKeys['test/templates/tpl'];

    await ws.cards.remove(parent);

    expect([parent, child].map((key) => ws.cards.has(key))).toEqual([
      false,
      false,
    ]);
  });

  it('removes a card while cards created in the same session exist', async () => {
    const { ws, keys } = await open(spec);
    const [created] = await ws.cards.create('test/templates/tpl');

    await ws.cards.remove(keys[0]);

    expect(ws.cards.has(created.key)).toBe(true);
    expect(ws.cards.has(keys[0])).toBe(false);
  });

  it.each([
    ['a missing card', () => 'test_zzzzzzzz', CardNotFoundError],
    [
      'a card of an imported template',
      (_k: string[], t: Record<string, string[]>) => t['mod/templates/mt'][0],
      /Cannot modify imported module/,
    ],
  ])('refuses to remove %s', async (_name, pick, error) => {
    const { ws, path, keys, templateKeys } = await open(spec);

    await expectRefused(
      path,
      () => ws.cards.remove(pick(keys, templateKeys)),
      error,
    );
  });
});
