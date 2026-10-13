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

import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { flow, metadataOf, projects, snapshot } from './fixture.js';

const open = projects();

// Cards A, B, C (Open) and D (Done); a template whose one card is titled 'new'.
const spec = {
  workflows: [flow],
  fieldTypes: [{ name: 'size', dataType: 'integer' }],
  cardTypes: [{ name: 'page', customFields: [{ name: 'size' }] }],
  cards: [
    { title: 'A' },
    { title: 'B' },
    { title: 'C' },
    { title: 'D', workflowState: 'Done' },
  ],
  templates: [
    { name: 'tpl', cards: [{ title: 'new', children: [{ title: 'kid' }] }] },
  ],
};

const on = (from: string, to: string) =>
  `field(X, "title", "${from}"), field(Y, "title", "${to}")`;
const run = (from: string, transition: string, to: string, effect: string) =>
  `onTransitionExecuteTransition(X, "${transition}", Y, "${effect}") :- ${on(from, to)}.`;
const set = (
  from: string,
  transition: string,
  to: string,
  field: string,
  value: string,
) =>
  `onTransitionSetField(X, "${transition}", Y, "${field}", ${value}) :- ${on(from, to)}.`;

async function openWith(...rules: string[]) {
  const project = await open({
    ...spec,
    calculations: { effects: rules.join('\n') },
  });
  const state = async (index: number) =>
    (await metadataOf(project.ws, project.keys[index])).workflowState;
  return { ...project, state };
}

describe('transition side effects', () => {
  // The rules fire when A is started; the expected states are A, B, C, D.
  it.each([
    [
      'runs a declared transition on another card',
      [run('A', 'Start', 'B', 'Close')],
      ['Review', 'Done', 'Open', 'Done'],
    ],
    [
      'cascades through a chain',
      [run('A', 'Start', 'B', 'Start'), run('B', 'Start', 'C', 'Close')],
      ['Review', 'Review', 'Done', 'Done'],
    ],
    [
      'stops a mutual cycle',
      [run('A', 'Start', 'B', 'Start'), run('B', 'Start', 'A', 'Start')],
      ['Review', 'Review', 'Open', 'Done'],
    ],
    [
      'stops a self-loop',
      [run('A', 'Start', 'B', 'Close'), run('B', 'Close', 'B', 'Close')],
      ['Review', 'Done', 'Open', 'Done'],
    ],
    [
      'skips a target the project denies',
      [
        run('A', 'Start', 'B', 'Close'),
        'transitionDenied(Y, "Close", "no") :- field(Y, "title", "B").',
      ],
      ['Review', 'Open', 'Open', 'Done'],
    ],
    [
      "skips a transition not available from the target's state",
      [run('A', 'Start', 'D', 'Start')],
      ['Review', 'Open', 'Open', 'Done'],
    ],
    [
      'skips a missing target and still runs the rest',
      [
        `onTransitionExecuteTransition(X, "Start", "test_zzzzzzzz", "Close") :- field(X, "title", "A").`,
        run('A', 'Start', 'C', 'Close'),
      ],
      ['Review', 'Open', 'Done', 'Done'],
    ],
  ] as [string, string[], string[]][])('%s', async (_name, rules, expected) => {
    const { cards, keys, state } = await openWith(...rules);

    await cards.transition(keys[0], 'Start');

    expect(await Promise.all(keys.map((_k, i) => state(i)))).toEqual(expected);
  });

  it('updates a field of another card, also from a cascaded transition', async () => {
    const { ws, cards, keys } = await openWith(
      run('A', 'Start', 'B', 'Start'),
      set('B', 'Start', 'C', 'title', '"Retitled"'),
      set('A', 'Start', 'B', 'test/fieldTypes/size', '7'),
    );

    await cards.transition(keys[0], 'Start');

    expect((await metadataOf(ws, keys[2])).title).toBe('Retitled');
    expect((await metadataOf(ws, keys[1]))['test/fieldTypes/size']).toBe(7);
  });

  it.each([
    ['a field the project does not have', 'nofield'],
    ['the rank', 'rank'],
    ['the card type', 'cardType'],
  ])(
    'leaves the target alone for an update of %s, and still transitions',
    async (_name, field) => {
      const { ws, path, keys, state } = await openWith(
        set('A', 'Start', 'B', field, '"x"'),
      );
      const target = join('cardRoot', keys[1], 'index.json');
      const before = snapshot(path)[target];

      await ws.cards.transition(keys[0], 'Start');

      expect(snapshot(path)[target]).toBe(before);
      expect(await state(0)).toBe('Review');
    },
  );

  it('skips a field update the project denies', async () => {
    const { ws, keys, state } = await openWith(
      set('A', 'Start', 'B', 'title', '"Retitled"'),
      'editingFieldDenied(Y, "title", "no") :- field(Y, "title", "B").',
    );

    await ws.cards.transition(keys[0], 'Start');

    expect((await metadataOf(ws, keys[1])).title).toBe('B');
    expect(await state(0)).toBe('Review');
  });

  it('completes the transition when the side-effect query fails', async () => {
    const { ws, keys, state } = await openWith(run('A', 'Start', 'B', 'Close'));
    const engine = ws.checkout.calculationEngine;
    const runQuery = engine.runQuery.bind(engine);
    vi.spyOn(engine, 'runQuery').mockImplementation((async (
      ...args: Parameters<typeof runQuery>
    ) => {
      if (args[0] === 'onTransition')
        throw new Error('broken module calculation');
      return runQuery(...args);
    }) as typeof runQuery);

    await ws.cards.transition(keys[0], 'Start');

    expect(await state(0)).toBe('Review');
    expect(await state(1)).toBe('Open');
  });
});

describe('creation side effects', () => {
  const effects = [
    run('new', 'Create', 'B', 'Close'),
    set('new', 'Create', 'C', 'title', '"Set on creation"'),
  ];

  it('runs the effects declared for created cards', async () => {
    const { ws, keys, state } = await openWith(...effects);

    await ws.cards.create('test/templates/tpl');

    expect(await state(1)).toBe('Done');
    expect((await metadataOf(ws, keys[2])).title).toBe('Set on creation');
  });

  it('queries once for a batch of created cards', async () => {
    const { ws } = await openWith();
    const query = vi.spyOn(ws.checkout.calculationEngine, 'creationQuery');

    const created = await ws.cards.create('test/templates/tpl', undefined);

    expect(query).toHaveBeenCalledTimes(1);
    expect([...query.mock.calls[0][0]].sort()).toEqual(
      created.map((card) => card.key).sort(),
    );
  });
});
