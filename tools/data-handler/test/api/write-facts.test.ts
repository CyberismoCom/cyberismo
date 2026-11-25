// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';

import { PermissionDeniedError } from '../../src/shared/exceptions/index.js';
import { childKeys, projects } from '../domain/cards/fixture.js';

const open = projects();

const spec = {
  cardTypes: [{ name: 'page' }],
  linkTypes: [{ name: 'relates' }],
  cards: [
    {
      title: 'Top',
      children: [{ title: 'A' }, { title: 'B' }, { title: 'C' }],
    },
    { title: 'Other' },
  ],
  calculations: {
    lock: 'editingFieldDenied(C, "title", "locked") :- field(C, "title", "Locked").\n',
  },
};

// Every write ends by rebuilding all facts, so a stale fact can only be seen
// by a query or a guard that runs later in the same write.
describe('facts inside one write', () => {
  it('shows a field edit to a query that follows it', async () => {
    const { ws, keys } = await open(spec);

    const [card] = await ws.atomic(async () => {
      await ws.cards.editField(keys[0], 'title', 'Renamed');
      return ws.queries.runQuery('card', 'localApp', { cardKey: keys[0] });
    }, 'Edit and query');

    expect(card.title).toBe('Renamed');
  });

  it('holds a later edit to the guard an earlier edit set off', async () => {
    const { ws, keys } = await open(spec);

    const edits = ws.atomic(async () => {
      await ws.cards.editField(keys[0], 'title', 'Locked');
      await ws.cards.editField(keys[0], 'title', 'Free again');
    }, 'Edit twice');

    await expect(edits).rejects.toThrow(PermissionDeniedError);
  });

  it('shows added and removed labels to a query that follows them', async () => {
    const { ws, keys } = await open(spec);

    const [added, removed] = await ws.atomic(async () => {
      const labelsNow = async () =>
        (await ws.queries.runQuery('card', 'localApp', { cardKey: keys[0] }))[0]
          .labels;
      await ws.cards.addLabel(keys[0], 'urgent');
      const afterAdd = await labelsNow();
      await ws.cards.removeLabel(keys[0], 'urgent');
      return [afterAdd, await labelsNow()];
    }, 'Label and query');

    expect([added, removed]).toEqual([['urgent'], []]);
  });

  it('shows added and removed links to a query that follows them', async () => {
    const { ws, keys } = await open(spec);
    const linkType = 'test/linkTypes/relates';

    const [added, removed] = await ws.atomic(async () => {
      const linksNow = async () =>
        (
          await ws.queries.runQuery('card', 'localApp', { cardKey: keys[0] })
        )[0].links.map((link) => link.key);
      await ws.cards.addLink(keys[0], keys[4], linkType);
      const afterAdd = await linksNow();
      await ws.cards.removeLink(keys[0], keys[4], linkType);
      return [afterAdd, await linksNow()];
    }, 'Link and query');

    expect([added, removed]).toEqual([[keys[4]], []]);
  });

  it('shows the new order to a query that follows a rank', async () => {
    const { ws, keys } = await open(spec);
    const [top, a, b, c] = keys;
    const childrenInTree = async () =>
      (await ws.queries.runQuery('tree'))
        .find((item) => item.key === top)!
        .children!.map((child) => child.key);

    const [first, after, rebalanced] = await ws.atomic(async () => {
      await ws.cards.rankFirst(c);
      const afterFirst = await childrenInTree();
      await ws.cards.rank(a, b);
      const afterRank = await childrenInTree();
      await ws.cards.rebalanceAll();
      const ranks = (await ws.queries.runQuery('tree'))
        .find((item) => item.key === top)!
        .children!.map((child) => child.rank);
      return [afterFirst, afterRank, ranks];
    }, 'Rank and query');

    expect(first).toEqual([c, a, b]);
    expect(after).toEqual([c, b, a]);
    expect(await childKeys(ws, top)).toEqual([c, b, a]);
    const stored = await Promise.all(
      [c, b, a].map(
        async (key) => (await ws.cards.details(key)).metadata!.rank,
      ),
    );
    expect(rebalanced).toEqual(stored);
  });
});
