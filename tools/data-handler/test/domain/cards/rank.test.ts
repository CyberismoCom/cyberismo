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

import { describe, expect, it } from 'vitest';

import type { Workspace } from '../../../src/api/workspace.js';
import {
  CardNotFoundError,
  ReadOnlyContainerError,
} from '../../../src/shared/exceptions/index.js';
import {
  childKeys,
  expectRefused,
  metadataOf,
  projects,
  rootKeys,
  snapshot,
  readOnlyModule,
} from './fixture.js';

const open = projects();

// Roots a b c d; parent p with children x y z; templates tpl(t1 t2) and
// mod's mt(m1 m2), which is read-only.
const spec = {
  cards: [
    { title: 'a' },
    { title: 'b' },
    { title: 'c' },
    { title: 'd' },
    { title: 'p', children: [{ title: 'x' }, { title: 'y' }, { title: 'z' }] },
  ],
  templates: [{ name: 'tpl', cards: [{}, {}] }],
  modules: [readOnlyModule([{}, {}])],
};

const order = (ws: Workspace, parent?: string) =>
  parent ? childKeys(ws, parent) : rootKeys(ws);

describe('cards.rank, rankFirst, rankAt', () => {
  // Roots are [a, b, c, d, p].
  it.each([
    ['rank after a sibling', (c, k) => c.rank(k[3], k[0]), [0, 3, 1, 2, 4]],
    [
      'rank after the last sibling',
      (c, k) => c.rank(k[0], k[4]),
      [1, 2, 3, 4, 0],
    ],
    ['rank first', (c, k) => c.rankFirst(k[2]), [2, 0, 1, 3, 4]],
    [
      'rank first when already first',
      (c, k) => c.rankFirst(k[0]),
      [0, 1, 2, 3, 4],
    ],
    ['rank at 0', (c, k) => c.rankAt(k[3], 0), [3, 0, 1, 2, 4]],
    ['rank at a middle index', (c, k) => c.rankAt(k[0], 2), [1, 0, 2, 3, 4]],
    ['rank at the sibling count', (c, k) => c.rankAt(k[0], 5), [1, 2, 3, 4, 0]],
  ] as [
    string,
    (c: Workspace['cards'], k: string[]) => Promise<void>,
    number[],
  ][])('orders root cards: %s', async (_name, operation, expected) => {
    const { ws, cards, keys } = await open(spec);

    await operation(cards, keys);

    expect(await rootKeys(ws)).toEqual(expected.map((i) => keys[i]));
  });

  it("orders only the card's own siblings, under a parent", async () => {
    const { ws, keys } = await open(spec);
    const [, , , , p, x, y, z] = keys;

    await ws.cards.rank(z, x);

    expect(await order(ws, p)).toEqual([x, z, y]);
    expect(await rootKeys(ws)).toEqual(keys.slice(0, 5));
  });

  it.each([
    ['after itself', (c, k) => c.rank(k[0], k[0]), /after itself/],
    [
      'after a card with another parent',
      (c, k) => c.rank(k[0], k[5]),
      /same parent/,
    ],
    [
      'after a card of another container',
      (c, k, t) => c.rank(k[0], t[0]),
      /same parent/,
    ],
    [
      'after a missing card',
      (c, k) => c.rank(k[0], 'test_zzzzzzzz'),
      CardNotFoundError,
    ],
    ['a missing card', (c) => c.rankFirst('test_zzzzzzzz'), CardNotFoundError],
    // Pins today's behaviour: the index counts the card itself, so the slot after it is 'after itself'.
    ['just past its own position', (c, k) => c.rankAt(k[1], 2), /after itself/],
    [
      'a card of an imported module',
      (c, _k, _t, m) => c.rankFirst(m),
      ReadOnlyContainerError,
    ],
    ['to a negative index', (c, k) => c.rankAt(k[0], -1), /greater than 0/],
    [
      'to an index past the siblings',
      (c, k) => c.rankAt(k[0], 6),
      /out of bounds/,
    ],
  ] as [
    string,
    (
      c: Workspace['cards'],
      k: string[],
      t: string[],
      m: string,
    ) => Promise<void>,
    RegExp | (new (...args: never[]) => Error),
  ][])('refuses to rank %s', async (_name, operation, error) => {
    const { cards, path, keys, templateKeys } = await open(spec);

    await expectRefused(
      path,
      () =>
        operation(
          cards,
          keys,
          templateKeys['test/templates/tpl'],
          templateKeys['mod/templates/mt'][1],
        ),
      error,
    );
  });
});

describe('cards.rebalance, rebalanceAll', () => {
  const crowded = {
    ...spec,
    cards: [
      { title: 'p', children: [{}, {}, {}, {}] },
      { title: 'q', children: [{}, {}, {}, {}] },
    ],
  };
  // Squeezes the last three of four siblings between the first and second.
  async function crowd(ws: Workspace, [, first, ...rest]: string[]) {
    for (const key of rest.reverse()) await ws.cards.rank(key, first);
  }
  const ranks = (ws: Workspace, keys: string[]) =>
    Promise.all(keys.map(async (key) => (await metadataOf(ws, key)).rank));
  const longest = async (ws: Workspace, keys: string[]) =>
    Math.max(...(await ranks(ws, keys)).map((rank) => rank.length));

  it("renumbers one parent's children and nobody else's", async () => {
    const { ws, keys } = await open(crowded);
    const [p, ...pChildren] = keys.slice(0, 5);
    const qKeys = keys.slice(5);
    await crowd(ws, [p, ...pChildren]);
    await crowd(ws, qKeys);
    const order = await childKeys(ws, p);
    const qRanks = await ranks(ws, qKeys.slice(1));

    await ws.cards.rebalance(p);

    expect(await childKeys(ws, p)).toEqual(order);
    expect(await longest(ws, pChildren)).toBeLessThan(5);
    expect(await ranks(ws, qKeys.slice(1))).toEqual(qRanks);
  });

  it('renumbers the project and its own templates, but not imported ones', async () => {
    const { ws, path, keys } = await open(crowded);
    await crowd(ws, keys.slice(0, 5));
    const modules = Object.entries(snapshot(path)).filter(([name]) =>
      name.startsWith('.cards/modules/'),
    );

    await ws.cards.rebalanceAll();

    expect(await longest(ws, keys.slice(2, 5))).toBeLessThan(5);
    expect(
      Object.entries(snapshot(path)).filter(([name]) =>
        name.startsWith('.cards/modules/'),
      ),
    ).toEqual(modules);
  });

  it('refuses to rebalance under a missing card', async () => {
    const { ws, path } = await open(spec);

    await expectRefused(
      path,
      () => ws.cards.rebalance('test_zzzzzzzz'),
      CardNotFoundError,
    );
  });
});
