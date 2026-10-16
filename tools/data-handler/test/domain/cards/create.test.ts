// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';

import { CardLocation } from '@cyberismo/model';
import type { Workspace } from '../../../src/api/workspace.js';
import { CardNotFoundError } from '../../../src/shared/exceptions/index.js';
import {
  childKeys,
  expectRefused,
  metadataOf,
  projects,
  rootKeys,
  readOnlyModule,
} from './fixture.js';

const open = projects();

const size = 'test/fieldTypes/size';
const tpl = 'test/templates/tpl';
// Template tpl: T1 (labelled, with content and a field value) over T2 and T3.
const spec = {
  fieldTypes: [{ name: 'size', dataType: 'integer' }],
  cardTypes: [{ name: 'page', customFields: [{ name: 'size' }] }],
  cards: [{ title: 'Parent' }],
  templates: [
    {
      name: 'tpl',
      cards: [
        {
          title: 'T1',
          labels: ['l'],
          content: 'body',
          fields: { [size]: 4 },
          children: [{ title: 'T2' }, { title: 'T3' }],
        },
      ],
    },
    { name: 'empty' },
  ],
  modules: [readOnlyModule()],
};

describe('cards.create', () => {
  it('instantiates the template as new cards, carrying what the template holds', async () => {
    const { ws, keys, templateKeys } = await open(spec);
    const [t1] = templateKeys[tpl];

    const created = await ws.cards.create(tpl);

    const [root, ...rest] = created;
    expect(created).toHaveLength(3);
    expect(root.parent).toBe('root');
    expect(rest.map((card) => card.parent)).toEqual([root.key, root.key]);
    expect(created.map((card) => card.key)).not.toContain(t1);
    const metadata = await metadataOf(ws, root.key);
    expect(metadata).toMatchObject({
      title: 'T1',
      cardType: 'test/cardTypes/page',
      labels: ['l'],
      workflowState: 'Open',
      templateCardKey: t1,
      [size]: 4,
    });
    expect((await ws.cards.details(root.key)).content).toBe('body');
    expect(await rootKeys(ws)).toEqual([keys[0], root.key]);
  });

  it('creates the cards under a parent card, after what is already there', async () => {
    const { ws, keys } = await open(spec);

    const first = await ws.cards.create(tpl, keys[0]);
    const second = await ws.cards.create(tpl, keys[0]);

    expect(first[0].parent).toBe(keys[0]);
    expect(await childKeys(ws, keys[0])).toEqual([first[0].key, second[0].key]);
  });

  it("copies template attachments under the new card's key and repoints the content", async () => {
    const { ws, templateKeys } = await open(spec);
    const [t1] = templateKeys[tpl];
    await ws.cards.addAttachment(t1, 'pic.png', Buffer.from('png'));
    await ws.cards.edit(
      t1,
      'image::pic.png[] {{#image}} "fileName": "pic.png" {{/image}}',
    );

    const [root] = await ws.cards.create(tpl);

    const card = await ws.cards.details(root.key);
    expect(card.attachments.map((a) => a.fileName)).toEqual([
      `${root.key}-pic.png`,
    ]);
    expect(card.content).toBe(
      `image::${root.key}-pic.png[] {{#image}} "fileName": "${root.key}-pic.png" {{/image}}`,
    );
    expect(
      (
        await ws.cards.attachment(root.key, `${root.key}-pic.png`)
      ).fileBuffer.toString(),
    ).toBe('png');
  });

  it("instantiates a module's template with the module's card type", async () => {
    const { ws } = await open(spec);

    const [created] = await ws.cards.create('mod/templates/mt');

    expect((await metadataOf(ws, created.key)).cardType).toBe(
      'mod/cardTypes/page',
    );
  });

  it.each([
    // Pins today's behaviour: a template that does not exist fails schema validation.
    [
      'an unknown template',
      (c: Workspace['cards']) => c.create('test/templates/nope'),
      /Invalid content JSON/,
    ],
    [
      'a template without cards',
      (c: Workspace['cards']) => c.create('test/templates/empty'),
      /No cards in template/,
    ],
    [
      'a missing parent card',
      (c: Workspace['cards']) => c.create(tpl, 'test_zzzzzzzz'),
      CardNotFoundError,
    ],
  ])('refuses %s', async (_name, operation, error) => {
    const { cards, path } = await open(spec);

    await expectRefused(path, () => operation(cards), error);
  });
});

describe('cards.addToTemplate', () => {
  it('adds the cards to the template, at the root or under a card', async () => {
    const { ws, templateKeys } = await open(spec);
    const [t1] = templateKeys[tpl];

    const roots = await ws.cards.addToTemplate(
      'test/cardTypes/page',
      tpl,
      undefined,
      2,
    );
    const children = await ws.cards.addToTemplate(
      'test/cardTypes/page',
      tpl,
      t1,
    );

    expect(roots).toHaveLength(2);
    expect((await ws.cards.details(roots[0])).parent).toBe('root');
    expect((await metadataOf(ws, roots[1])).cardType).toBe(
      'test/cardTypes/page',
    );
    expect((await ws.cards.details(children[0])).parent).toBe(t1);
    expect(await childKeys(ws, t1)).toContain(children[0]);
  });

  it.each([
    [
      'an empty template name',
      (c: Workspace['cards']) => c.addToTemplate('test/cardTypes/page', ''),
      /template name is invalid/,
    ],
    [
      'a template that does not exist',
      (c: Workspace['cards']) =>
        c.addToTemplate('test/cardTypes/page', 'test/templates/nope'),
      /nope/,
    ],
    [
      'an unknown card type',
      (c: Workspace['cards']) => c.addToTemplate('test/cardTypes/nope', tpl),
      /nope/,
    ],
    [
      'a count of zero',
      (c: Workspace['cards']) =>
        c.addToTemplate('test/cardTypes/page', tpl, undefined, 0),
      /Invalid value for 'repeat:'/,
    ],
    [
      'a missing parent card',
      (c: Workspace['cards']) =>
        c.addToTemplate('test/cardTypes/page', tpl, 'test_zzzzzzzz'),
      CardNotFoundError,
    ],
    [
      'an imported template',
      (c: Workspace['cards']) =>
        c.addToTemplate('mod/cardTypes/page', 'mod/templates/mt'),
      /imported|read-only/i,
    ],
    [
      'a parent card from an imported template',
      (c: Workspace['cards'], t: Record<string, string[]>) =>
        c.addToTemplate('test/cardTypes/page', tpl, t['mod/templates/mt'][0]),
      /is not part of template 'test\/templates\/tpl'/,
    ],
  ])('refuses %s', async (_name, operation, error) => {
    const { cards, path, templateKeys } = await open(spec);

    await expectRefused(path, () => operation(cards, templateKeys), error);
  });
});

describe('card reads', () => {
  const projectKeys = (k: string[]) => k;
  const templates = (_k: string[], t: Record<string, string[]>) => [
    ...t[tpl],
    ...t['mod/templates/mt'],
  ];
  it.each([
    [CardLocation.projectOnly, ['project'], projectKeys],
    [CardLocation.templatesOnly, ['template', 'template'], templates],
    [
      CardLocation.all,
      ['project', 'template', 'template'],
      (k: string[], t: Record<string, string[]>) => [
        ...projectKeys(k),
        ...templates(k, t),
      ],
    ],
  ])(
    'lists the cards of %s, skipping empty templates',
    async (location, types, expected) => {
      const { cards, keys, templateKeys } = await open(spec);

      const lists = await cards.list(location);

      expect(lists.map((list) => list.type)).toEqual(types);
      expect(lists.flatMap((list) => list.cards).toSorted()).toEqual(
        expected(keys, templateKeys).toSorted(),
      );
    },
  );

  it("refuses details without a card key and gives a card's logic program", async () => {
    const { cards, keys } = await open(spec);

    await expect(cards.details('')).rejects.toThrow(
      /Mandatory parameter 'cardKey'/,
    );
    expect(await cards.logicProgram(keys[0])).toContain(keys[0]);
  });
});
