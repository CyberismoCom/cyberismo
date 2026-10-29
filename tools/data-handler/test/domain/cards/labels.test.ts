// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';

import type { Workspace } from '../../../src/api/workspace.js';

import { CardNotFoundError } from '../../../src/shared/exceptions/index.js';
import { expectRefused, metadataOf, projects } from './fixture.js';

const open = projects();

// A has 'one', B has 'one' and 'two', C none; the template card has 'tpl'.
const spec = {
  cards: [{ labels: ['one'] }, { labels: ['one', 'two'] }, {}],
  templates: [{ name: 'tpl', cards: [{ labels: ['tpl'] }] }],
};

describe('card labels', () => {
  it('adds a label after the existing ones and stamps lastUpdated', async () => {
    const { ws, keys } = await open(spec);
    const before = await metadataOf(ws, keys[1]);

    await ws.cards.addLabel(keys[1], 'three');

    const after = await metadataOf(ws, keys[1]);
    expect(after.labels).toEqual(['one', 'two', 'three']);
    expect(after.lastUpdated).not.toBe(before.lastUpdated);
  });

  it.each([
    ['a named label', 1, 'one', ['two']],
    ['the only label, named', 0, 'one', []],
    ['the only label, unnamed', 0, '', []],
  ])('removes %s', async (_name, card, label, expected) => {
    const { ws, keys } = await open(spec);

    await ws.cards.removeLabel(keys[card], label);

    expect((await metadataOf(ws, keys[card])).labels).toEqual(expected);
  });

  it('lists the labels in use, project and templates, once each and sorted', async () => {
    const { ws, keys } = await open(spec);
    await ws.cards.addLabel(keys[2], 'a-label');

    expect(await ws.cards.labels()).toEqual(['a-label', 'one', 'tpl', 'two']);

    await ws.cards.removeLabel(keys[1], 'two');
    expect(await ws.cards.labels()).toEqual(['a-label', 'one', 'tpl']);
  });

  it.each([
    [
      'adding an invalid label',
      (c, k) => c.addLabel(k[0], 'bad/label'),
      /Not a valid label name/,
    ],
    [
      'adding an empty label',
      (c, k) => c.addLabel(k[0], ''),
      /Not a valid label name/,
    ],
    [
      'adding a label the card has',
      (c, k) => c.addLabel(k[0], 'one'),
      /Label already exists/,
    ],
    [
      'adding to a missing card',
      (c) => c.addLabel('test_zzzzzzzz', 'x'),
      CardNotFoundError,
    ],
    [
      'removing a label the card lacks',
      (c, k) => c.removeLabel(k[1], 'nine'),
      /Label 'nine' does not exist/,
    ],
    [
      'removing without a name from several',
      (c, k) => c.removeLabel(k[1], ''),
      /multiple labels/,
    ],
    [
      'removing without a name from none',
      (c, k) => c.removeLabel(k[2], ''),
      /there are no labels/,
    ],
    [
      'removing from a missing card',
      (c) => c.removeLabel('test_zzzzzzzz', 'x'),
      CardNotFoundError,
    ],
  ] as [
    string,
    (c: Workspace['cards'], k: string[]) => Promise<void>,
    RegExp | (new (...args: never[]) => Error),
  ][])('refuses %s', async (_name, operation, error) => {
    const { cards, path, keys } = await open(spec);

    await expectRefused(path, () => operation(cards, keys), error);
  });
});
