// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Workspace } from '../../../src/api/workspace.js';

import {
  CardNotFoundError,
  ContainerMismatchError,
  CycleError,
  ReadOnlyContainerError,
} from '../../../src/shared/exceptions/index.js';
import {
  childKeys,
  expectRefused,
  git,
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

  it('moves a card under another card at a position', async () => {
    const { ws, path, keys } = await open(spec);
    const [a, a1, a2] = keys;

    await ws.cards.move(a2, keys[3], 0);
    await ws.cards.move(a1, keys[3], 1);

    expect(await childKeys(ws, keys[3])).toEqual([a2, a1]);
    expect(await childKeys(ws, a)).toEqual([]);
    expect(existsSync(join(path, 'cardRoot', keys[3], 'c', a1))).toBe(true);
  });

  it('only ranks a card moved to its own parent at a position', async () => {
    const { ws, keys } = await open(spec);
    const [a, a1, a2] = keys;

    await ws.cards.move(a2, a, 0);

    expect(await childKeys(ws, a)).toEqual([a2, a1]);
  });

  it('moves a template card to its own root at a position', async () => {
    const { ws, templateKeys } = await open({
      ...spec,
      templates: [{ name: 'tpl', cards: [{ children: [{}] }, {}] }],
    });
    const [t1, t2, t3] = templateKeys['test/templates/tpl'];

    await ws.cards.move(t2, 'root', 1);

    const [tree] = (await ws.cards.templateCards()).filter(
      (tree) => tree.name === 'test/templates/tpl',
    );
    // The template's cards are listed in no particular order.
    const ranked = tree.cards
      .map((card) => [card.metadata!.rank, card.key])
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, key]) => key);
    expect(ranked).toEqual([t1, t2, t3]);
  });

  // Without autocommit a failed write is not rolled back: the position is
  // checked before the card moves.
  it.each([
    ['a negative position', -1, /^Index must not be negative$/],
    ['a position past the new siblings', 1, /^Index 1 is out of bounds$/],
    ['a fractional position', 0.5, /^Index must be a whole number$/],
    ['an infinite position', Infinity, /^Index must be a whole number$/],
    ['a position that is not a number', NaN, /^Index must be a whole number$/],
  ])('refuses %s, moving nothing', async (_name, index, error) => {
    const { ws, path, keys } = await open(spec);

    await expectRefused(
      path,
      () => ws.cards.move(keys[1], keys[3], index),
      error,
    );
  });

  // A card that stays under its parent counts itself among the positions.
  it('ranks a card staying under its parent up to the end, and no further', async () => {
    const { ws, path, keys } = await open(spec);
    const [a, a1, a2] = keys;

    await expectRefused(
      path,
      () => ws.cards.move(a1, a, 3),
      /^Index 3 is out of bounds$/,
    );
    await ws.cards.move(a1, a, 2);

    expect(await childKeys(ws, a)).toEqual([a2, a1]);
  });

  it('leaves a card staying under its parent where it is at the position right after itself', async () => {
    const { ws, keys } = await open(spec);
    const [a, a1, a2] = keys;

    await ws.cards.move(a2, a, 2);
    await ws.cards.move(a1, a, 1);

    expect(await childKeys(ws, a)).toEqual([a1, a2]);
  });

  // A moved card is ranked after the ranked siblings, so before unranked
  // ones; the position counts the new siblings as they were before the move.
  it.each([
    [1, ['x', 'moved', 'u']],
    [2, ['x', 'u', 'moved']],
  ])(
    'moves a card to position %i among new siblings that are not all ranked',
    async (index, expected) => {
      const { ws, keys } = await open({
        cards: [
          { title: 'a', children: [{ title: 'moved' }] },
          {
            title: 'b',
            children: [{ title: 'x' }, { title: 'u', fields: { rank: '' } }],
          },
        ],
      });
      const [, moved, b, x, u] = keys;
      const names: Record<string, string> = {
        [moved]: 'moved',
        [x]: 'x',
        [u]: 'u',
      };

      await ws.cards.move(moved, b, index);

      expect((await childKeys(ws, b)).map((key) => names[key])).toEqual(
        expected,
      );
    },
  );

  it('a move to the own parent is a rank commit', async () => {
    const { ws, path, keys } = await open(
      { ...spec, git: true },
      { autocommit: true },
    );

    await ws.cards.move(keys[2], keys[0], 0);

    expect(await childKeys(ws, keys[0])).toEqual([keys[2], keys[1]]);
    expect(await git(path, 'log', '-1', '--format=%s')).toBe(
      `Rank card ${keys[2]}`,
    );
  });

  it('a move to a position is one commit', async () => {
    const { ws, path, keys } = await open(
      { ...spec, git: true },
      { autocommit: true },
    );
    const before = await git(path, 'rev-list', '--count', 'HEAD');

    await ws.cards.move(keys[1], keys[3], 0);

    expect(await git(path, 'log', '-1', '--format=%s')).toBe(
      `Move card ${keys[1]} to ${keys[3]}`,
    );
    expect(Number(await git(path, 'rev-list', '--count', 'HEAD'))).toBe(
      Number(before) + 1,
    );
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
