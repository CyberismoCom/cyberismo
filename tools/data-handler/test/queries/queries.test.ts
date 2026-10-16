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

import { DHValidationError } from '../../src/exceptions/index.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import { projects } from '../cards/fixture.js';

const open = projects();

const spec = {
  cardTypes: [{ name: 'page' }],
  cards: [
    { title: 'Top', children: [{ title: 'Child A' }, { title: 'Child B' }] },
    { title: 'Other', workflowState: 'Closed' },
  ],
  reports: {
    children: {
      query: 'select("title").\nresult(C) :- parent(C, {{cardKey}}).\n',
      content: '{{#each results}}* {{this.title}}\n{{/each}}',
    },
    echo: { content: 'Value is {{value}}.' },
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
