// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';

import type { QueryResult } from '@cyberismo/model';

import { exportedTree } from '../../../src/shared/utils/card-utils.js';
import { expectRefused, projects, snapshot } from '../cards/fixture.js';
import {
  hiddenCaseSpec,
  hiddenCases,
  keyOf,
  titlesOf,
} from './hidden-cases.js';

const open = projects();

const text = (files: Record<string, Uint8Array>) =>
  Buffer.from(files['index.adoc']).toString();

// Top(Sub1, Sub2), Second. Rank order is spec order.
const spec = {
  fieldTypes: [{ name: 'note', dataType: 'shortText' }],
  cardTypes: [
    {
      name: 'page',
      customFields: [{ name: 'note' }],
      alwaysVisibleFields: ['note'],
    },
  ],
  cards: [
    {
      title: 'Top',
      content: 'Top body.',
      labels: ['red', 'blue'],
      fields: { 'test/fieldTypes/note': 'a|b' },
      children: [
        { title: 'Sub1', content: 'Sub1 body.' },
        { title: 'Sub2', workflowState: 'Closed' },
      ],
    },
    { title: 'Second', content: 'Second body.' },
  ],
};

const order = (adoc: string, ...titles: string[]) =>
  titles.map((title) => adoc.indexOf(`== ${title}\n`));

describe('export.adoc', () => {
  it('writes every card as a section, parents before their children, in rank order', async () => {
    const { ws } = await open(spec);

    const adoc = text(await ws.export.adoc());

    const positions = order(adoc, 'Top', 'Sub1', 'Sub2', 'Second');
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(adoc.startsWith(':imagesdir: ./a/\n')).toBe(true);
  });

  it('follows a rank change', async () => {
    const { ws, keys } = await open(spec);
    await ws.cards.rankFirst(keys[2]);

    const adoc = text(await ws.export.adoc());

    const [sub1, sub2] = order(adoc, 'Sub1', 'Sub2');
    expect(sub2).toBeLessThan(sub1);
  });

  it('puts each card key, state, type and labels in a metadata table before its content', async () => {
    const { ws, keys } = await open(spec);

    const adoc = text(await ws.export.adoc());

    const section = adoc.slice(
      adoc.indexOf('== Top\n'),
      adoc.indexOf('== Sub1'),
    );
    expect(section).toContain(`|Card key|${keys[0]}\n`);
    expect(section).toContain('|Status|Open\n');
    expect(section).toContain('|Card type|test/cardTypes/page\n');
    expect(section).toContain('|Labels|red, blue');
    expect(section.indexOf('|===')).toBeLessThan(section.indexOf('Top body.'));
    expect(adoc).toContain('|Status|Closed\n');
  });

  // Pins today's behaviour: the labels row has no line end, so the first field
  // row runs on from it, and a field without a display name shows its full name.
  it('lists the visible custom fields of the card type, escaping a pipe in the value', async () => {
    const { ws } = await open(spec);

    expect(text(await ws.export.adoc())).toContain(
      '|Labels|red, blue|Test/fieldTypes/note|a\\|b\n',
    );
  });

  it('exports one card with its descendants', async () => {
    const { ws, keys } = await open(spec);

    const adoc = text(await ws.export.adoc(keys[0]));

    expect(order(adoc, 'Top', 'Sub1', 'Sub2').every((at) => at >= 0)).toBe(
      true,
    );
    expect(adoc).not.toContain('== Second');
  });

  it('evaluates the macros of a card below the top level', async () => {
    const { ws, keys } = await open({
      ...spec,
      cards: [
        {
          title: 'Top',
          children: [
            {
              title: 'Leaf',
              fields: { 'test/fieldTypes/note': 'leaf note' },
              content: '{{#field}}"field": "test/fieldTypes/note"{{/field}}',
            },
          ],
        },
      ],
    });

    const adoc = text(await ws.export.adoc(keys[0]));

    expect(adoc).toContain('pass:[leaf note]');
    expect(adoc).not.toContain('{{#field}}');
  });

  it('exports a card below the top as its own section', async () => {
    const { ws, keys } = await open(spec);

    const adoc = text(await ws.export.adoc(keys[1]));

    expect(adoc).toContain('== Sub1');
    expect(adoc).not.toContain('== Top');
  });

  it('gives the attachments of the exported cards by path, and no others', async () => {
    const { ws, keys } = await open(spec);
    await ws.cards.addAttachment(keys[1], 'one.png', Buffer.from('1'));
    await ws.cards.addAttachment(keys[3], 'two.png', Buffer.from('2'));

    const files = await ws.export.adoc(keys[0]);

    expect(Object.keys(files).sort()).toEqual(['a/one.png', 'index.adoc']);
    expect(Buffer.from(files['a/one.png']).toString()).toBe('1');
  });

  it('reflects an edit made through the same handle', async () => {
    const { ws, keys } = await open(spec);
    await ws.cards.edit(keys[3], 'Edited body.');

    expect(text(await ws.export.adoc())).toContain('Edited body.');
  });

  it.each(hiddenCases.filter((row) => row.recursive !== false))(
    '$name',
    async ({ hidden, start, exported }) => {
      const { ws, keys } = await open(hiddenCaseSpec(hidden));

      const adoc = text(
        await ws.export.adoc(start ? keyOf(keys, start) : undefined),
      );

      const cardKeys = [...adoc.matchAll(/^\|Card key\|(\S+)$/gm)].map(
        (match) => match[1],
      );
      expect(titlesOf(keys, cardKeys)).toEqual([...exported].sort());
    },
  );

  it('refuses a card the project does not have, writing nothing', async () => {
    const { ws, path } = await open(spec);

    await expectRefused(
      path,
      () => ws.export.adoc('test_zzzzzzzz'),
      /Card 'test_zzzzzzzz' does not exist in the project/,
    );
  });

  it('writes nothing', async () => {
    const { ws, path } = await open(spec);
    const before = snapshot(path);

    await ws.export.adoc();

    expect(snapshot(path)).toEqual(before);
  });
});

// The site export runs the tree query and exportedTree, as the backend does.
describe('exportedTree on the site tree query', () => {
  it.each(hiddenCases)(
    '$name',
    async ({ hidden, start, recursive = true, exported }) => {
      const { ws, keys } = await open(hiddenCaseSpec(hidden));
      const cardKey = start ? keyOf(keys, start) : undefined;

      const tree = exportedTree(
        await ws.queries.runQuery(
          'tree',
          'exportedSite',
          cardKey ? { cardKey, recursive } : {},
        ),
        { cardKey },
      );

      const flat = (nodes: QueryResult<'tree'>[]): string[] =>
        nodes.flatMap((node) => [node.key, ...flat(node.children ?? [])]);
      expect(titlesOf(keys, flat(tree))).toEqual([...exported].sort());
    },
  );
});
