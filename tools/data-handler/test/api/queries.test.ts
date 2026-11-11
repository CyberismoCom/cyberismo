// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';

import { DHValidationError } from '../../src/shared/exceptions/index.js';
import { resourceName } from '../../src/shared/utils/resource-utils.js';
import { projects } from '../domain/cards/fixture.js';

const open = projects();

const spec = {
  cardTypes: [{ name: 'page' }],
  cards: [
    { title: 'Top', children: [{ title: 'Child A' }, { title: 'Child B' }] },
    { title: 'Other', workflowState: 'Closed' },
  ],
  calculations: {
    hide: 'hiddenInTreeView(C) :- field(C, "title", "Hidden").\n',
  },
  reports: {
    children: {
      query: 'select("title").\nresult(C) :- parent(C, {{cardKey}}).\n',
      content: '{{#each results}}* {{this.title}}\n{{/each}}',
    },
    echo: { content: 'Value is {{value}}.' },
    quoted: {
      query:
        'result(C) :- parent(C, {{cardKey}}).\nresultField(C, "title", {{#quoted}}\na "q" b\\c\nd\n{{/quoted}}) :- parent(C, {{cardKey}}).\n',
      content: '{{#each results}}{{{this.title}}}{{/each}}',
    },
    helpers: {
      content:
        '{{#if (eq value 1)}}EQ{{/if}}{{#if (ne value 1)}}NE{{/if}} {{subtract 100 value}} {{multiply value 2}}',
    },
  },
};

describe('queries.runQuery', () => {
  it('gives the card tree with the children nested under their parent', async () => {
    const { ws, keys } = await open(spec);
    const [top, childA, childB, other] = keys;

    const tree = await ws.queries.runQuery('tree');

    expect(tree.map((item) => item.key).sort()).toEqual([top, other].sort());
    expect(
      tree
        .find((item) => item.key === top)!
        .children!.map((child) => child.key)
        .sort(),
    ).toEqual([childA, childB].sort());
  });

  it('returns hidden cards flagged, and hides their descendants too', async () => {
    const { ws, keys } = await open({
      ...spec,
      cards: [
        {
          title: 'Shown',
          children: [{ title: 'Hidden', children: [{ title: 'Inner' }] }],
        },
      ],
    });
    const [shown, hidden, inner] = keys;

    const tree = await ws.queries.runQuery('tree');

    const child = tree.find((item) => item.key === shown)!.children![0];
    expect([tree[0].isHidden, child.key, child.isHidden]).toEqual([
      false,
      hidden,
      true,
    ]);
    expect([child.children![0].key, child.children![0].isHidden]).toEqual([
      inner,
      true,
    ]);
  });

  it('reads the card the project holds as the query sees it', async () => {
    const { ws, keys } = await open(spec);

    const cards = await ws.queries.runQuery('card');

    expect(cards.map((card) => [card.key, card.workflowState])).toEqual(
      expect.arrayContaining([
        [keys[0], 'Open'],
        [keys[3], 'Closed'],
      ]),
    );
  });

  it('sees a write made through the same handle', async () => {
    const { ws, keys } = await open(spec);

    await ws.cards.remove(keys[1]);

    const cards = await ws.queries.runQuery('card');
    expect(cards.map((card) => card.key)).not.toContain(keys[1]);
  });
});

describe('queries.runQuery card fields', () => {
  const fieldSpec = {
    fieldTypes: [
      { name: 'always', dataType: 'shortText' },
      { name: 'optional', dataType: 'integer' },
      { name: 'hidden', dataType: 'longText' },
    ],
    cardTypes: [
      {
        name: 'page',
        customFields: [
          { name: 'hidden' },
          { name: 'optional' },
          { name: 'always' },
        ],
        alwaysVisibleFields: ['always'],
        optionallyVisibleFields: ['optional'],
      },
    ],
    cards: [
      {
        title: 'Card',
        fields: {
          'test/fieldTypes/always': 'a',
          'test/fieldTypes/optional': 7,
          'test/fieldTypes/hidden': 'h',
        },
      },
    ],
  };

  it.each([
    ['always', 'always', 'number', 'a', 'shortText'],
    ['optional', 'optional', 'number', 7, 'integer'],
    ['hidden', undefined, 'undefined', 'h', 'longText'],
  ])(
    'gives the %s field with its value',
    async (name, visibility, indexType, value, dataType) => {
      const { ws, keys } = await open(fieldSpec);

      const [card] = await ws.queries.runQuery('card', 'localApp', {
        cardKey: keys[0],
      });

      const field = card.fields!.find(
        (f) => f.key === `test/fieldTypes/${name}`,
      );
      expect(field?.visibility).toBe(visibility);
      expect(typeof field?.index).toBe(indexType);
      expect(field).toMatchObject({
        value,
        dataType,
        fieldDisplayName: name,
      });
    },
  );

  it('puts the hidden fields after the visible ones', async () => {
    const { ws, keys } = await open(fieldSpec);

    const [card] = await ws.queries.runQuery('card', 'localApp', {
      cardKey: keys[0],
    });

    expect(card.fields!.map((f) => f.key)).toEqual([
      'test/fieldTypes/always',
      'test/fieldTypes/optional',
      'test/fieldTypes/hidden',
    ]);
  });
});

describe('queries.program', () => {
  it('puts a named query before the whole program', async () => {
    const { ws } = await open(spec);
    const whole = await ws.queries.program();

    const withQuery = await ws.queries.program('tree');

    expect(withQuery.length).toBeGreaterThan(whole.length);
    expect(withQuery.endsWith(whole)).toBe(true);
  });

  it('holds the cards of the project', async () => {
    const { ws, keys } = await open(spec);

    expect(await ws.queries.program()).toContain(
      `field(${keys[0]}, "title", "Top")`,
    );
  });

  it('refuses a query it does not know', async () => {
    const { ws } = await open(spec);

    const program = ws.queries.program('bogus');

    await expect(program).rejects.toThrow(
      "Unknown query 'bogus'. Must be one of: card, connectors, enabledSkills, onCreation, onTransition, tree",
    );
    await expect(program).rejects.toBeInstanceOf(DHValidationError);
  });
});

describe('queries.runLogicProgram', () => {
  it('answers a program over the project facts', async () => {
    const { ws, keys } = await open(spec);

    const result = await ws.queries.runLogicProgram(
      `select("title").\nresult(C) :- parent(C, ${keys[0]}).`,
    );

    expect(result.error).toBeNull();
    expect(result.results.map((row) => row.title).sort()).toEqual([
      'Child A',
      'Child B',
    ]);
  });

  it('refuses a program that does not parse', async () => {
    const { ws } = await open(spec);

    await expect(ws.queries.runLogicProgram('result(X :- ')).rejects.toThrow(
      /Parsing failed/,
    );
  });
});

describe('queries.linkCandidates', () => {
  it('gives cards as full candidates with their card type', async () => {
    const { ws, keys } = await open(spec);

    const candidates = await ws.queries.linkCandidates(
      `select(1, "results", "title").\nselect(1, "results", "cardType").\nresult(C) :- parent(C, ${keys[0]}).`,
    );

    expect(candidates.sort((a, b) => a.title.localeCompare(b.title))).toEqual([
      {
        key: keys[1],
        kind: 'card',
        title: 'Child A',
        cardType: 'test/cardTypes/page',
      },
      {
        key: keys[2],
        kind: 'card',
        title: 'Child B',
        cardType: 'test/cardTypes/page',
      },
    ]);
  });

  it('keys an external item by its connector and item key, not the parsed tuple', async () => {
    const { ws } = await open(spec);

    const candidates = await ws.queries.linkCandidates(
      [
        'externalItem(("jira", "J-1")).',
        'field(("jira", "J-1"), "title", "First").',
        'result((C, K)) :- externalItem((C, K)).',
        'resultField((C, K), "connector", C) :- externalItem((C, K)).',
        'resultField((C, K), "itemKey", K) :- externalItem((C, K)).',
        'resultField((C, K), "title", T) :- externalItem((C, K)), field((C, K), "title", T).',
      ].join('\n'),
    );

    expect(candidates).toEqual([
      {
        key: 'jira:J-1',
        kind: 'external',
        title: 'First',
        connector: 'jira',
        itemKey: 'J-1',
      },
    ]);
  });

  it('refuses a program the query language rejects', async () => {
    const { ws } = await open(spec);

    await expect(
      ws.queries.linkCandidates(
        'result(X) :- projectCard(X).\norderBy("title").',
      ),
    ).rejects.toThrow(DHValidationError);
  });
});

describe('queries.logicProgram', () => {
  it('gives the facts of a resource', async () => {
    const { ws } = await open(spec);

    expect(
      await ws.queries.logicProgram(resourceName('test/workflows/default')),
    ).toContain('workflow("test/workflows/default")');
  });
});

describe('queries.runReport', () => {
  it('renders the report for a card from its query', async () => {
    const { ws, keys } = await open(spec);

    const result = await ws.queries.runReport(
      'test/reports/children',
      { cardKey: keys[0] },
      'localApp',
    );

    expect(result).toContain('* Child A');
    expect(result).toContain('* Child B');
  });

  it('renders to nothing when the query finds nothing', async () => {
    const { ws, keys } = await open(spec);

    expect(
      await ws.queries.runReport(
        'test/reports/children',
        { cardKey: keys[3] },
        'localApp',
      ),
    ).toBe('');
  });

  it('hands a quoted body to Clingo as one intact string', async () => {
    const { ws, keys } = await open(spec);

    const result = await ws.queries.runReport(
      'test/reports/quoted',
      { cardKey: keys[0] },
      'localApp',
    );

    expect(result).toBe('a "q" b\\c\nd'.repeat(2));
  });

  it('renders a report without a query from its parameters', async () => {
    const { ws, keys } = await open(spec);

    expect(
      await ws.queries.runReport(
        'test/reports/echo',
        { cardKey: keys[0], value: 7 },
        'localApp',
      ),
    ).toBe('Value is 7.');
  });

  it.each([
    [1, 'EQ 99 2'],
    [7, 'NE 93 14'],
  ])(
    'renders the comparison and math helpers for %i',
    async (value, expected) => {
      const { ws, keys } = await open(spec);

      expect(
        await ws.queries.runReport(
          'test/reports/helpers',
          { cardKey: keys[0], value },
          'localApp',
        ),
      ).toBe(expected);
    },
  );

  it('refuses a report the project does not have', async () => {
    const { ws, keys } = await open(spec);

    await expect(
      ws.queries.runReport(
        'test/reports/gone',
        { cardKey: keys[0] },
        'localApp',
      ),
    ).rejects.toThrow("Report 'test/reports/gone' does not exist");
  });

  it.each([
    ['a name', '', { cardKey: 'x' }, '"name" field'],
    ['parameters', 'test/reports/echo', undefined, '"parameters" field'],
    ['a card key', 'test/reports/echo', {}, '"cardKey" field'],
  ])('refuses a call without %s', async (_, name, parameters, message) => {
    const { ws } = await open(spec);

    const run = ws.queries.runReport(name, parameters as never, 'localApp');

    await expect(run).rejects.toThrow(message);
    await expect(run).rejects.toBeInstanceOf(DHValidationError);
  });
});
