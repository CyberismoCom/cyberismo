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

import type { Workspace } from '../../src/workspace/workspace.js';

import {
  CardNotFoundError,
  ContainerMismatchError,
  CycleError,
  ReadOnlyContainerError,
} from '../../src/exceptions/index.js';
import {
  childKeys,
  expectRefused,
  projects,
  rootKeys,
  snapshot,
  readOnlyModule,
} from './fixture.js';

const open = projects();

// Cards a(a1, a2), b, c; templates tpl(t1(t2)) and other(u1); module template mod(m1).
const spec = {
  cards: [
    { title: 'a', children: [{ title: 'a1' }, { title: 'a2' }] },
    { title: 'b' },
    { title: 'c' },
  ],
  templates: [
    { name: 'tpl', cards: [{ children: [{}] }] },
    { name: 'other', cards: [{}] },
  ],
  modules: [readOnlyModule([{ children: [{}] }])],
};

describe('cards.move', () => {
  it('moves a card under another card, on disk and in the tree', async () => {
    const { ws, path, keys } = await open(spec);
    const [a, a1, a2, b] = keys;

    await ws.cards.move(a1, b);

    expect((await ws.cards.details(a1)).parent).toBe(b);
    expect(await childKeys(ws, b)).toEqual([a1]);
    expect(await childKeys(ws, a)).toEqual([a2]);
    expect(existsSync(join(path, 'cardRoot', b, 'c', a1, 'index.json'))).toBe(
      true,
    );
    expect(existsSync(join(path, 'cardRoot', a, 'c', a1))).toBe(false);
  });

  it('moves a card to the root as the last root card', async () => {
    const { ws, keys } = await open(spec);
    const [, a1, , b, c] = keys;

    await ws.cards.move(a1, 'root');

    expect((await ws.cards.details(a1)).parent).toBe('root');
    expect(await rootKeys(ws)).toEqual([keys[0], b, c, a1]);
  });

  it('moves a whole subtree with the card', async () => {
    const { ws, keys } = await open(spec);
    const [a, a1, a2, b] = keys;

    await ws.cards.move(a, b);

    expect(await childKeys(ws, b)).toEqual([a]);
    expect(await childKeys(ws, a)).toEqual([a1, a2]);
    expect((await ws.cards.details(a2)).parent).toBe(a);
  });

  it('does nothing, and asks no permission, for a card already at its destination', async () => {
    const { ws, path, keys } = await open({
      ...spec,
      calculations: {
        deny: 'movingCardDenied(C, "locked") :- field(C, "title", "a1").',
      },
    });
    const before = snapshot(path);

    await ws.cards.move(keys[1], keys[0]);

    expect(snapshot(path)).toEqual(before);
  });

  it('moves template cards between templates', async () => {
    const { ws, templateKeys } = await open(spec);
    const [t1, t2] = templateKeys['test/templates/tpl'];
    const [u1] = templateKeys['test/templates/other'];

    await ws.cards.move(t2, u1);
    expect((await ws.cards.details(t2)).parent).toBe(u1);
    expect(await childKeys(ws, u1)).toEqual([t2]);

    await ws.cards.move(t1, 'root:other');
    const trees = await ws.cards.templateCards();
    const names = (name: string) =>
      trees.find((tree) => tree.name === name)?.cards.map((card) => card.key);
    expect(names('test/templates/tpl')).toEqual([]);
    expect(names('test/templates/other')).toEqual(
      expect.arrayContaining([t1, u1]),
    );
  });

  // Pins today's behaviour: no check that the template exists, so the card
  // lands in an orphan template folder.
  it('moves a template card to the root of a missing template', async () => {
    const { ws, path, templateKeys } = await open(spec);
    const [t1] = templateKeys['test/templates/tpl'];

    await ws.cards.move(t1, 'root:nope');

    expect(existsSync(join(path, '.cards/local/templates/nope/c', t1))).toBe(
      true,
    );
    expect(existsSync(join(path, '.cards/local/templates/nope.json'))).toBe(
      false,
    );
  });

  type Move = (
    cards: Workspace['cards'],
    keys: string[],
    templateKeys: Record<string, string[]>,
  ) => Promise<unknown>;
  it.each<[string, Move, RegExp | (new (...args: never[]) => Error)]>([
    ['the root', (c) => c.move('root', 'root'), /Cannot move "root"/],
    ['itself', (c, k) => c.move(k[3], k[3]), /cannot be moved to itself/],
    ['its own descendant', (c, k) => c.move(k[0], k[1]), CycleError],
    [
      'a missing card',
      (c) => c.move('test_zzzzzzzz', 'root'),
      CardNotFoundError,
    ],
    [
      'under a missing card',
      (c, k) => c.move(k[3], 'test_zzzzzzzz'),
      CardNotFoundError,
    ],
    [
      'a project card into a template',
      (c, k, t) => c.move(k[3], t['test/templates/tpl'][0]),
      ContainerMismatchError,
    ],
    [
      'a project card to a template root',
      (c, k) => c.move(k[3], 'root:tpl'),
      ContainerMismatchError,
    ],
    [
      'a template card into the project',
      (c, k, t) => c.move(t['test/templates/tpl'][0], k[3]),
      ContainerMismatchError,
    ],
    [
      'a template card to the project root',
      (c, _k, t) => c.move(t['test/templates/tpl'][0], 'root:project'),
      ContainerMismatchError,
    ],
    [
      'a module template card',
      (c, _k, t) => c.move(t['mod/templates/mt'][1], 'root'),
      ReadOnlyContainerError,
    ],
  ])('refuses to move %s', async (_name, move, error) => {
    const { cards, path, keys, templateKeys } = await open(spec);

    await expectRefused(path, () => move(cards, keys, templateKeys), error);
  });
});
