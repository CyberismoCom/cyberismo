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

import type { Workspace } from '../../src/api/workspace/workspace.js';
import { CardNotFoundError } from '../../src/shared/exceptions/index.js';
import { expectRefused, metadataOf, projects } from './fixture.js';

const open = projects();

const rel = 'test/linkTypes/rel';
const note = 'test/linkTypes/note';
const described = 'test/linkTypes/described';
const jira = {
  linkType: rel,
  connector: 'jira',
  externalItemKey: 'P-1',
  direction: 'outbound',
};
// Cards A and B (page), C (note); A links to B (rel) and to C (described, 'why').
const spec = {
  cardTypes: [{ name: 'page' }, { name: 'memo' }],
  linkTypes: [
    { name: 'rel' },
    { name: 'described', enableLinkDescription: true },
    { name: 'note', sourceCardTypes: ['page'], destinationCardTypes: ['memo'] },
    { name: 'jiraOnly', destinationConnectors: ['jira'] },
  ],
  cards: [
    {
      links: [
        { linkType: 'rel', to: 1 },
        { linkType: 'described', to: 2, linkDescription: 'why' },
      ],
      fields: { externalLinks: [jira] },
    },
    {},
    { cardType: 'memo' },
  ],
};

type Links = Workspace['cards'];
const linksOf = async (ws: Workspace, key: string) =>
  (await metadataOf(ws, key)).links;
const externalOf = async (ws: Workspace, key: string) =>
  (await metadataOf(ws, key)).externalLinks;

describe('cards.addLink', () => {
  it('stores the link on the source card only', async () => {
    const { ws, keys } = await open(spec);

    await ws.cards.addLink(keys[1], keys[0], rel);
    await ws.cards.addLink(keys[1], keys[2], described, 'because');

    expect(await linksOf(ws, keys[1])).toEqual([
      { linkType: rel, cardKey: keys[0] },
      { linkType: described, cardKey: keys[2], linkDescription: 'because' },
    ]);
    expect(await linksOf(ws, keys[0])).toHaveLength(2);
    expect(await linksOf(ws, keys[2])).toEqual([]);
  });

  it('stores an external link on the card, in the direction given or implied', async () => {
    const { ws, keys } = await open(spec);

    await ws.cards.addLink(keys[1], 'jira:P-2', rel);
    await ws.cards.addLink('jira:P-3', keys[1], rel);
    await ws.cards.addLink(keys[1], 'jira:P-4', rel, undefined, 'inbound');

    const ext = (externalItemKey: string, direction: string) => ({
      linkType: rel,
      connector: 'jira',
      externalItemKey,
      direction,
    });
    expect(await externalOf(ws, keys[1])).toEqual([
      ext('P-2', 'outbound'),
      ext('P-3', 'inbound'),
      ext('P-4', 'inbound'),
    ]);
    expect(await linksOf(ws, keys[1])).toEqual([]);
  });

  it.each([
    [
      'a card to itself',
      (c: Links, k: string[]) => c.addLink(k[1], k[1], rel),
      /to itself/,
    ],
    [
      'two external items',
      (c: Links) => c.addLink('a:1', 'b:2', rel),
      /two external items/,
    ],
    [
      'a link that exists',
      (c: Links, k: string[]) => c.addLink(k[0], k[1], rel),
      /already exists/,
    ],
    [
      'an external link that exists',
      (c: Links, k: string[]) => c.addLink(k[0], 'jira:P-1', rel),
      /already exists/,
    ],
    [
      'an unknown link type',
      (c: Links, k: string[]) => c.addLink(k[1], k[0], 'test/linkTypes/nope'),
      /nope/,
    ],
    [
      'a description the link type does not allow',
      (c: Links, k: string[]) => c.addLink(k[1], k[0], rel, 'x'),
      /does not allow link description/,
    ],
    [
      'a source card type the link type excludes',
      (c: Links, k: string[]) => c.addLink(k[2], k[0], note),
      /cannot be used as source/,
    ],
    [
      'a destination card type the link type excludes',
      (c: Links, k: string[]) => c.addLink(k[1], k[0], note),
      /cannot be used as destination/,
    ],
    [
      'a connector the link type excludes',
      (c: Links, k: string[]) =>
        c.addLink(k[1], 'other:1', 'test/linkTypes/jiraOnly'),
      /does not support links to connector 'other'/,
    ],
    [
      'an external item without a key',
      (c: Links, k: string[]) => c.addLink(k[1], 'jira:', rel),
      /Invalid external item format/,
    ],
    [
      'a missing source card',
      (c: Links, k: string[]) => c.addLink('test_zzzzzzzz', k[0], rel),
      CardNotFoundError,
    ],
    [
      'a missing destination card',
      (c: Links, k: string[]) => c.addLink(k[1], 'test_zzzzzzzz', rel),
      CardNotFoundError,
    ],
  ])('refuses %s', async (_name, operation, error) => {
    const { cards, path, keys } = await open(spec);

    await expectRefused(path, () => operation(cards, keys), error);
  });
});

describe('cards.removeLink', () => {
  it('removes the one matching link and keeps the others', async () => {
    const { ws, keys } = await open(spec);

    await ws.cards.removeLink(keys[0], keys[2], described, 'why');

    expect(await linksOf(ws, keys[0])).toEqual([
      { linkType: rel, cardKey: keys[1] },
    ]);
  });

  it('removes an external link by item, direction and type', async () => {
    const { ws, keys } = await open(spec);

    await ws.cards.removeLink(keys[0], 'jira:P-1', rel);

    expect(await externalOf(ws, keys[0])).toEqual([]);
    expect(await linksOf(ws, keys[0])).toHaveLength(2);
  });

  it.each([
    [
      'a link of another type',
      (c: Links, k: string[]) => c.removeLink(k[0], k[1], described),
      /not found/,
    ],
    [
      'a link with another description',
      (c: Links, k: string[]) => c.removeLink(k[0], k[2], described, 'else'),
      /not found/,
    ],
    [
      'a link the card lacks',
      (c: Links, k: string[]) => c.removeLink(k[1], k[0], rel),
      /not found/,
    ],
    [
      'an external link in the other direction',
      (c: Links, k: string[]) =>
        c.removeLink(k[0], 'jira:P-1', rel, undefined, 'inbound'),
      /External link .* not found/,
    ],
    [
      'an external link the card lacks',
      (c: Links, k: string[]) => c.removeLink(k[0], 'jira:P-9', rel),
      /External link .* not found/,
    ],
    [
      'two external items',
      (c: Links) => c.removeLink('a:1', 'b:2', rel),
      /two external items/,
    ],
    [
      'an external item without a key',
      (c: Links, k: string[]) => c.removeLink(k[0], 'jira:', rel),
      /Invalid external item format/,
    ],
    [
      'a missing card',
      (c: Links, k: string[]) => c.removeLink('test_zzzzzzzz', k[0], rel),
      CardNotFoundError,
    ],
  ])('refuses %s', async (_name, operation, error) => {
    const { cards, path, keys } = await open(spec);

    await expectRefused(path, () => operation(cards, keys), error);
  });
});
