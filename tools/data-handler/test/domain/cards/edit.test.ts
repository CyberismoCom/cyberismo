// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CardNotFoundError,
  ReadOnlyContainerError,
} from '../../../src/shared/exceptions/index.js';
import {
  expectRefused,
  metadataOf,
  projects,
  snapshot,
  readOnlyModule,
} from './fixture.js';

const open = projects();

const size = 'test/fieldTypes/size';
const score = 'test/fieldTypes/score';
const bonus = 'test/fieldTypes/bonus';
const spec = {
  fieldTypes: [
    { name: 'size', dataType: 'integer' },
    { name: 'score', dataType: 'integer' },
    { name: 'bonus', dataType: 'integer' },
  ],
  cardTypes: [
    {
      name: 'page',
      customFields: [
        { name: 'size' },
        { name: 'score', isCalculated: true },
        { name: 'bonus', isCalculated: true, enableOverride: true },
      ],
    },
  ],
  cards: [
    { title: 'A', content: 'hello', fields: { [size]: 1, [bonus]: 2 } },
    { title: 'Locked' },
  ],
  templates: [{ name: 'tpl', cards: [{ title: 'Locked' }] }],
  modules: [readOnlyModule()],
};

describe('cards.edit', () => {
  it('writes the content and stamps lastUpdated, changing nothing else', async () => {
    const { ws, path, keys } = await open(spec);
    const before = await metadataOf(ws, keys[0]);

    await ws.cards.edit(keys[0], 'changed');

    const card = await ws.cards.details(keys[0]);
    expect(card.content).toBe('changed');
    expect(
      readFileSync(join(path, 'cardRoot', keys[0], 'index.adoc'), 'utf-8'),
    ).toBe('changed');
    expect(card.metadata).toEqual({
      ...before,
      lastUpdated: card.metadata!.lastUpdated,
    });
    expect(card.metadata!.lastUpdated).not.toBe(before.lastUpdated);
  });

  it('edits a template card', async () => {
    const { ws, templateKeys } = await open(spec);
    const [key] = templateKeys['test/templates/tpl'];

    await ws.cards.edit(key, 'template text');

    expect((await ws.cards.details(key)).content).toBe('template text');
  });

  it.each([
    ['a missing card', () => 'test_zzzzzzzz', CardNotFoundError],
    [
      'a module template card',
      (_k: string[], t: Record<string, string[]>) => t['mod/templates/mt'][0],
      ReadOnlyContainerError,
    ],
  ])('refuses to edit %s', async (_name, pick, error) => {
    const { ws, path, keys, templateKeys } = await open(spec);

    await expectRefused(
      path,
      () => ws.cards.edit(pick(keys, templateKeys), 'x'),
      error,
    );
  });
});

describe('cards.editField', () => {
  it.each([
    ['a predefined field', 'title', 'Renamed', 'title'],
    ['a custom field', size, 9, size],
    ['a calculated field that allows override', bonus, 5, bonus],
    ['labels', 'labels', ['x', 'y'], 'labels'],
  ])('sets %s', async (_name, field, value, key) => {
    const { ws, keys } = await open(spec);
    const before = await metadataOf(ws, keys[0]);

    await ws.cards.editField(keys[0], field, value);

    const after = await metadataOf(ws, keys[0]);
    expect(after[key]).toEqual(value);
    expect(after.lastUpdated).not.toBe(before.lastUpdated);
    expect({ ...after, [key]: 0, lastUpdated: '' }).toEqual({
      ...before,
      [key]: 0,
      lastUpdated: '',
    });
  });

  // The stored value after clearing: absent for custom fields, null for predefined ones.
  it.each([
    ['a custom field', size, {}],
    ['a calculated field without override', score, {}],
    ['a field with no stored value', 'test/fieldTypes/nothing', {}],
    ['a predefined field', 'title', { title: null }],
  ] as [string, string, Record<string, null>][])(
    'clears %s',
    async (_name, field, expected) => {
      const { ws, path, keys } = await open({
        ...spec,
        cards: [{ fields: { [size]: 1, [score]: 3 } }],
      });

      await ws.cards.editField(keys[0], field, null as never);

      const stored = JSON.parse(
        readFileSync(join(path, 'cardRoot', keys[0], 'index.json'), 'utf-8'),
      );
      expect(stored[field]).toBe(expected[field]);
      expect(field in stored).toBe(field in expected);
    },
  );

  it('does not write when the value is the one already there', async () => {
    const { ws, path, keys } = await open(spec);
    const before = snapshot(path);

    await ws.cards.editField(keys[0], size, 1);

    expect(snapshot(path)).toEqual(before);
  });

  it.each([
    ['an empty key', (k: string[]) => ['', 'x', k[0]], /cannot be empty/],
    ['a value of the wrong type', (k: string[]) => [size, 'abc', k[0]], /size/],
    [
      'a calculated field without override',
      (k: string[]) => [score, 4, k[0]],
      /Cannot edit calculated field 'test\/fieldTypes\/score'/,
    ],
    [
      'an invalid label',
      (k: string[]) => ['labels', ['bad/label'], k[0]],
      /naming rules/,
    ],
    [
      'a state the workflow lacks',
      (k: string[]) => ['workflowState', 'Nope', k[0]],
      /Nope/,
    ],
    [
      'a missing card',
      () => ['title', 'x', 'test_zzzzzzzz'],
      CardNotFoundError,
    ],
  ])('refuses %s', async (_name, args, error) => {
    const { ws, path, keys } = await open(spec);
    const [field, value, card] = args(keys) as [string, never, string];

    await expectRefused(
      path,
      () => ws.cards.editField(card, field, value as never),
      error,
    );
  });
});
