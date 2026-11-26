// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  flow,
  metadataOf,
  projects,
  snapshot,
} from '../domain/cards/fixture.js';
import { ActionFailedError } from '../../src/shared/exceptions/index.js';
import { checkoutOf } from '../../src/state/checkout/internal.js';

const open = projects();

const field = (name: string) => `test/fieldTypes/${name}`;

// Cards A, B, C (Open) and D (Done, with an enum value its field type lacks);
// a template whose root card is titled 'new', and one whose only card is.
// Field 'other' is not a field of the card type, 'calc' is calculated.
const spec = {
  workflows: [flow],
  fieldTypes: [
    { name: 'size', dataType: 'integer' },
    { name: 'level', dataType: 'enum', enumValues: ['low', 'high'] },
    { name: 'due', dataType: 'date' },
    { name: 'at', dataType: 'dateTime' },
    { name: 'who', dataType: 'person' },
    { name: 'note', dataType: 'shortText' },
    { name: 'calc', dataType: 'shortText' },
    { name: 'other', dataType: 'shortText' },
  ],
  cardTypes: [
    {
      name: 'page',
      customFields: [
        { name: 'size' },
        { name: 'level' },
        { name: 'due' },
        { name: 'at' },
        { name: 'who' },
        { name: 'note' },
        { name: 'calc', isCalculated: true },
      ],
    },
  ],
  cards: [
    { title: 'A' },
    {
      title: 'B',
      fields: {
        [field('due')]: '2026-01-01',
        [field('at')]: '2026-01-02T01:04:00.000Z',
        [field('who')]: 'a@b.fi',
        [field('note')]: 'x',
      },
    },
    { title: 'C' },
    {
      title: 'D',
      workflowState: 'Done',
      fields: { [field('level')]: 'bogus' },
    },
  ],
  templates: [
    { name: 'tpl', cards: [{ title: 'new', children: [{ title: 'kid' }] }] },
    { name: 'single', cards: [{ title: 'new' }] },
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

describe('transition hooks', () => {
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
    // B and C start before either finishes. Depth-first, the first of them
    // to start would try to finish the other while it is still Open.
    [
      'runs the cascade breadth-first',
      [
        run('A', 'Start', 'B', 'Start'),
        run('A', 'Start', 'C', 'Start'),
        run('B', 'Start', 'C', 'Finish'),
        run('C', 'Start', 'B', 'Finish'),
      ],
      ['Review', 'Done', 'Done', 'Done'],
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

  it('skips only the row that cannot be read', async () => {
    const { ws, keys } = await openWith();
    // The hook program's result, in place of the solved one.
    vi.spyOn(
      checkoutOf(ws).calculationEngine,
      'runLogicProgram',
    ).mockResolvedValueOnce({
      error: null,
      results: [
        {
          key: 'action',
          setField: [{ key: 'a', card: keys[2], field: 'title', value: 'Y' }],
          // No transition name: the row cannot be read.
          transition: [{ key: 'c', card: keys[1] }],
        },
      ],
    });

    await ws.cards.transition(keys[0], 'Start');

    expect((await metadataOf(ws, keys[2])).title).toBe('Y');
  });

  it('completes the transition when the hook program fails', async () => {
    const { ws, keys, state } = await openWith(run('A', 'Start', 'B', 'Close'));
    vi.spyOn(
      checkoutOf(ws).calculationEngine,
      'runLogicProgram',
    ).mockRejectedValueOnce(new Error('broken module calculation'));

    await ws.cards.transition(keys[0], 'Start');

    expect(await state(0)).toBe('Review');
    expect(await state(1)).toBe('Open');
  });
});

// What a hook setField writes. Each rule fires when A is started and sets a
// field of B (D for the card with an invalid field).
describe('hook field updates', () => {
  // [name, rules, card index, field, value after]
  it.each<[string, string[], number, string, unknown]>([
    [
      'skips an invalid enum value',
      [set('A', 'Start', 'B', field('level'), '"medium"')],
      1,
      field('level'),
      undefined,
    ],
    [
      'skips an update of a card with an unrelated invalid field',
      [set('A', 'Start', 'D', 'title', '"Retitled"')],
      3,
      'title',
      'D',
    ],
    [
      "writes a card's good field next to a bad one",
      [
        set('A', 'Start', 'B', 'title', '"Good"'),
        set('A', 'Start', 'B', 'nofield', '"x"'),
      ],
      1,
      'title',
      'Good',
    ],
    [
      'skips a field outside the card type',
      [set('A', 'Start', 'B', field('other'), '"x"')],
      1,
      field('other'),
      undefined,
    ],
    [
      'skips a date-time for a date field',
      [set('A', 'Start', 'B', field('due'), '"2026-03-04T10:00:00Z"')],
      1,
      field('due'),
      '2026-01-01',
    ],
    [
      'writes a date-time in UTC',
      [set('A', 'Start', 'C', field('at'), '"2026-01-02T03:04+02:00"')],
      2,
      field('at'),
      '2026-01-02T01:04:00.000Z',
    ],
    [
      'skips a bad date',
      [set('A', 'Start', 'B', field('due'), '"not a date"')],
      1,
      field('due'),
      '2026-01-01',
    ],
    [
      'skips a decimal for an integer field',
      [set('A', 'Start', 'B', field('size'), '"7.9"')],
      1,
      field('size'),
      undefined,
    ],
    [
      'skips a bad person',
      [set('A', 'Start', 'B', field('who'), '"nobody"')],
      1,
      field('who'),
      'a@b.fi',
    ],
    [
      'skips a calculated field',
      [set('A', 'Start', 'B', field('calc'), '"x"')],
      1,
      field('calc'),
      undefined,
    ],
    [
      'clears a text field with null',
      [set('A', 'Start', 'B', field('note'), 'null')],
      1,
      field('note'),
      undefined,
    ],
    [
      'clears a date field with null',
      [set('A', 'Start', 'B', field('due'), 'null')],
      1,
      field('due'),
      undefined,
    ],
    [
      'writes the string "null" to a text field',
      [set('A', 'Start', 'B', field('note'), '"null"')],
      1,
      field('note'),
      'null',
    ],
    [
      'skips setting workflowState directly',
      [set('A', 'Start', 'B', 'workflowState', '"Done"')],
      1,
      'workflowState',
      'Open',
    ],
  ])('%s', async (_name, rules, index, name, expected) => {
    const { ws, keys, state } = await openWith(...rules);

    await ws.cards.transition(keys[0], 'Start');

    expect((await metadataOf(ws, keys[index]))[name]).toEqual(expected);
    expect(await state(0)).toBe('Review');
  });

  it('skips each effect refused alone and applies the rest', async () => {
    const { ws, keys, state, templateKeys } = await openWith(
      set('A', 'Start', 'new', 'title', '"On a template card"'),
      set('A', 'Start', 'B', field('size'), '"abc"'),
      run('A', 'Start', 'B', 'Nope'),
      set('A', 'Start', 'C', 'title', '"Applied"'),
    );
    const [templateCard] = templateKeys['test/templates/tpl'];

    await ws.cards.transition(keys[0], 'Start');

    expect((await metadataOf(ws, templateCard)).title).toBe('new');
    expect((await metadataOf(ws, keys[1]))[field('size')]).toBeUndefined();
    expect(await state(1)).toBe('Open');
    expect((await metadataOf(ws, keys[2])).title).toBe('Applied');
  });

  it('skips both of two values for one field and applies the others', async () => {
    const { ws, keys } = await openWith(
      set('A', 'Start', 'B', 'title', '"one"'),
      set('A', 'Start', 'B', 'title', '"two"'),
      set('A', 'Start', 'B', field('size'), '3'),
      set('A', 'Start', 'C', 'title', '"Applied"'),
    );

    await ws.cards.transition(keys[0], 'Start');

    expect(await metadataOf(ws, keys[1])).toMatchObject({
      title: 'B',
      [field('size')]: 3,
    });
    expect((await metadataOf(ws, keys[2])).title).toBe('Applied');
  });

  it('does not count a value refused alone as a second value', async () => {
    const { ws, keys } = await openWith(
      set('A', 'Start', 'B', field('size'), '"abc"'),
      set('A', 'Start', 'B', field('size'), '"1"'),
    );

    await ws.cards.transition(keys[0], 'Start');

    expect((await metadataOf(ws, keys[1]))[field('size')]).toBe(1);
  });

  it('skips a field update the project denies and applies the others', async () => {
    const { ws, keys } = await openWith(
      set('A', 'Start', 'B', 'title', '"Denied"'),
      set('A', 'Start', 'C', 'title', '"Applied"'),
      'editingFieldDenied(Y, "title", "no") :- field(Y, "title", "B").',
    );

    await ws.cards.transition(keys[0], 'Start');

    expect((await metadataOf(ws, keys[1])).title).toBe('B');
    expect((await metadataOf(ws, keys[2])).title).toBe('Applied');
  });

  it('skips an effect whose check throws and applies the rest', async () => {
    const { ws, keys } = await openWith(
      set('A', 'Start', 'B', field('size'), '7'),
      set('A', 'Start', 'C', 'title', '"Applied"'),
    );
    const resources = checkoutOf(ws).resources;
    const byType = resources.byType.bind(resources);
    let thrown = false;
    vi.spyOn(resources, 'byType').mockImplementation(((
      ...args: Parameters<typeof byType>
    ) => {
      if (!thrown && args[0] === field('size') && args[1] === 'fieldTypes') {
        thrown = true;
        throw new Error('broken field type');
      }
      return byType(...args);
    }) as typeof byType);

    await ws.cards.transition(keys[0], 'Start');

    expect(thrown).toBe(true);
    expect((await metadataOf(ws, keys[1]))[field('size')]).toBeUndefined();
    expect((await metadataOf(ws, keys[2])).title).toBe('Applied');
  });

  it("applies a hook's field updates before its transitions", async () => {
    const { ws, keys, state } = await openWith(
      set('A', 'Start', 'B', 'title', '"Hooked"'),
      run('A', 'Start', 'B', 'Close'),
      'transitionDenied(Y, "Close", "not hooked") :- field(Y, "title", "B").',
    );

    await ws.cards.transition(keys[0], 'Start');

    expect((await metadataOf(ws, keys[1])).title).toBe('Hooked');
    expect(await state(1)).toBe('Done');
  });

  it('skips both of two transitions of one card', async () => {
    const { ws, keys, state } = await openWith(
      run('A', 'Start', 'B', 'Start'),
      run('A', 'Start', 'B', 'Finish'),
    );

    await ws.cards.transition(keys[0], 'Start');

    expect(await state(1)).toBe('Open');
  });

  it('does not write the card file for a hook setField that changes nothing', async () => {
    const { ws, path, keys } = await openWith(
      set('A', 'Start', 'B', 'title', '"B"'),
    );
    const target = join('cardRoot', keys[1], 'index.json');
    const before = snapshot(path)[target];

    await ws.cards.transition(keys[0], 'Start');

    expect(snapshot(path)[target]).toBe(before);
  });

  it('does not write the card file for a date-time it has in another zone', async () => {
    const { ws, path, keys } = await openWith(
      set('A', 'Start', 'B', field('at'), '"2026-01-02T03:04+02:00"'),
    );
    const target = join('cardRoot', keys[1], 'index.json');
    const before = snapshot(path)[target];

    await ws.cards.transition(keys[0], 'Start');

    expect(snapshot(path)[target]).toBe(before);
  });

  it("shows a hook write inside an action to the next program's guard", async () => {
    const { ws, keys, state } = await openWith(
      set('A', 'Start', 'B', 'title', '"Hooked"'),
      'transitionDenied(Y, "Close", "not hooked") :- field(Y, "title", "B").',
    );

    await ws.cards.runAction(keys[0], [
      'transition(C, "Start") :- actionCard(C).',
      'transition(Y, "Close") :- field(Y, "title", "Hooked").',
    ]);

    expect(await state(1)).toBe('Done');
  });

  it('runs a hook transition at most once in one action', async () => {
    const { ws, keys } = await openWith(
      run('A', 'Start', 'B', 'Close'),
      run('C', 'Start', 'B', 'Close'),
    );
    // Close is allowed from any state, so only the limit stops a second one.
    const solve = vi.spyOn(checkoutOf(ws).calculationEngine, 'runLogicProgram');

    await ws.cards.runAction(keys[0], [
      `transition(${keys[0]}, "Start"). transition(${keys[2]}, "Start").`,
    ]);

    const hooksOfB = solve.mock.calls.filter(([program]) =>
      program.includes(`onTransitionSetField(${keys[1]}, "Close"`),
    );
    expect(hooksOfB).toHaveLength(1);
  });

  // A transition runs once in an action, whether a hook or the action runs it
  // first. In one program the atoms' order decides which comes first: C
  // sorts before A, and A before B.
  it.each<[string, string, (k: string[]) => string[]]>([
    [
      'a hook, in one program',
      'B',
      (k) => [`transition(${k[0]}, "Start"). transition(${k[1]}, "Close").`],
    ],
    [
      'the action, in one program',
      'C',
      (k) => [`transition(${k[0]}, "Start"). transition(${k[2]}, "Close").`],
    ],
    [
      'a hook, in an earlier program',
      'B',
      (k) => [`transition(${k[0]}, "Start").`, `transition(${k[1]}, "Close").`],
    ],
    [
      'the action, in an earlier program',
      'B',
      (k) => [`transition(${k[1]}, "Close").`, `transition(${k[0]}, "Start").`],
    ],
  ])(
    'runs a transition once when %s runs it first',
    async (_, target, programs) => {
      const { ws, keys } = await openWith(run('A', 'Start', target, 'Close'));
      expect(keys[2] < keys[0] && keys[0] < keys[1]).toBe(true);
      const solve = vi.spyOn(
        checkoutOf(ws).calculationEngine,
        'runLogicProgram',
      );

      await ws.cards.runAction(keys[0], programs(keys));

      const closed = keys['ABC'.indexOf(target)];
      const hooksOfClose = solve.mock.calls.filter(([program]) =>
        program.includes(`onTransitionSetField(${closed}, "Close"`),
      );
      expect(hooksOfClose).toHaveLength(1);
    },
  );

  it("applies the hooks of an action's transition leniently", async () => {
    const { ws, keys, state } = await openWith(
      run('A', 'Start', 'B', 'Finish'),
      run('A', 'Start', 'C', 'Close'),
    );

    await ws.cards.runAction(keys[0], [
      'transition(C, "Start") :- actionCard(C).',
    ]);

    expect(await state(0)).toBe('Review');
    expect(await state(1)).toBe('Open');
    expect(await state(2)).toBe('Done');
  });

  it("keeps a hook's write when a later program of the action fails", async () => {
    const { ws, keys, state } = await openWith(
      set('A', 'Start', 'C', 'title', '"Hooked"'),
    );

    const error = await ws.cards
      .runAction(keys[0], [
        'transition(C, "Start") :- actionCard(C).',
        `transition(${keys[1]}, "Finish").`,
      ])
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ActionFailedError);
    expect((error as ActionFailedError).details).toMatchObject({ program: 2 });
    expect(await state(0)).toBe('Review');
    expect((await metadataOf(ws, keys[2])).title).toBe('Hooked');
  });
});

describe('creation hooks', () => {
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

  it("runs the effects declared for the cards of an action's create", async () => {
    const { ws, keys, state } = await openWith(...effects);

    await ws.cards.runAction(keys[0], ['create(root, "test/templates/tpl").']);

    expect(await state(1)).toBe('Done');
    expect((await metadataOf(ws, keys[2])).title).toBe('Set on creation');
  });

  it('runs the effects declared for the cards a CSV import creates', async () => {
    const { ws, keys, state } = await openWith(...effects);

    await ws.cards.importCsv(
      'title,template,description,labels\nImported,test/templates/single,,',
    );

    expect(await state(1)).toBe('Done');
    expect((await metadataOf(ws, keys[2])).title).toBe('Set on creation');
  });

  it('returns the created cards as the effects left them', async () => {
    const { ws } = await openWith(
      set('new', 'Create', 'new', 'title', '"Renamed"'),
    );

    const created = await ws.cards.create('test/templates/tpl');

    expect(created.map((card) => card.metadata?.title)).toEqual([
      'Renamed',
      'kid',
    ]);
    expect((await metadataOf(ws, created[0].key)).title).toBe('Renamed');
  });

  it('completes the create when the hook program fails', async () => {
    const { ws } = await openWith();
    vi.spyOn(
      checkoutOf(ws).calculationEngine,
      'runLogicProgram',
    ).mockRejectedValue(new Error('broken module calculation'));

    await ws.cards.create('test/templates/tpl');

    expect(await ws.cards.roots()).toHaveLength(5);
  });

  it('does not run creation hooks for cards added to a template', async () => {
    const { ws, keys } = await openWith(
      `onTransitionSetField(X, "Create", Y, "title", "Hooked") :- field(X, "cardType", _), field(Y, "title", "C").`,
    );

    await ws.cards.addToTemplate('test/cardTypes/page', 'test/templates/tpl');

    expect((await metadataOf(ws, keys[2])).title).toBe('C');
  });

  it('solves once for a batch of created cards', async () => {
    const { ws } = await openWith();
    const solve = vi.spyOn(checkoutOf(ws).calculationEngine, 'runLogicProgram');

    const created = await ws.cards.create('test/templates/tpl', undefined);

    expect(solve).toHaveBeenCalledTimes(1);
    for (const card of created) {
      expect(solve.mock.calls[0][0]).toContain(`createdCard(${card.key}).`);
    }
  });
});
