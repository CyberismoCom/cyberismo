// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Workspace } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { MockAuthProvider, MOCK_ROLE_COOKIE } from '../src/auth/mock.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';
import {
  directoryOf,
  openTestWorkspace,
} from './helpers/open-test-workspace.js';

const base = '/api/projects/decision/cards';

let app: ReturnType<typeof createApp>;
let ws: Workspace;
let tempTestDataPath: string;
// A card of the decision workflow under decision_5, in state Draft.
let card: string;

beforeEach(async () => {
  tempTestDataPath = await createTempTestData('decision-records');
  ws = await openTestWorkspace(tempTestDataPath);
  app = createApp(new MockAuthProvider(), directoryOf(ws));
  [{ key: card }] = await ws.cards.create(
    'decision/templates/decision',
    'decision_5',
  );
});

afterEach(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

const send = (path: string, method: string, body: unknown, role = 'editor') =>
  app.request(`${base}/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      cookie: `${MOCK_ROLE_COOKIE}=${role}`,
    },
    body: JSON.stringify(body),
  });

describe('PUT /cards/:key/content', () => {
  test('replaces the content and answers with the card', async () => {
    const response = await send(`${card}/content`, 'PUT', {
      content: 'New body',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ key: card });
    expect((await ws.cards.details(card)).content).toBe('New body');
  });

  test.each([{}, { content: 1 }])('refuses the body %j', async (body) => {
    expect((await send(`${card}/content`, 'PUT', body)).status).toBe(400);
  });
});

describe('PATCH /cards/:key/fields', () => {
  test('passes the field to the card and answers with its data only', async () => {
    const response = await send(`${card}/fields`, 'PATCH', {
      field: 'labels',
      value: ['one', 'two'],
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ key: card, labels: ['one', 'two'] });
    expect(result).not.toHaveProperty('adocContent');
  });

  test.each([
    {},
    { field: 'title' },
    { field: '', value: 'x' },
    { field: 'title', value: { nested: true } },
    { field: 'title', value: 'x', labels: [] },
    { title: 'x' },
  ])('refuses the body %j', async (body) => {
    expect((await send(`${card}/fields`, 'PATCH', body)).status).toBe(400);
  });

  test('is refused to a reader', async () => {
    const response = await send(
      `${card}/fields`,
      'PATCH',
      { field: 'title', value: 'x' },
      'reader',
    );
    expect(response.status).toBe(403);
  });
});

describe('POST /cards/:key/transition', () => {
  test('transitions the card and answers with it', async () => {
    const response = await send(`${card}/transition`, 'POST', {
      transition: 'Approve',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ workflowState: 'Approved' });
    expect((await ws.cards.details(card)).metadata?.workflowState).toBe(
      'Approved',
    );
  });

  test.each([{}, { transition: '' }, { state: 'Approve' }])(
    'refuses the body %j',
    async (body) => {
      expect((await send(`${card}/transition`, 'POST', body)).status).toBe(400);
    },
  );
});

describe('POST /cards/:key/move', () => {
  const children = async (parent: string) =>
    (await ws.cards.details(parent)).children;
  const rank = async (key: string) =>
    (await ws.cards.details(key)).metadata!.rank;

  test('moves the card under another parent', async () => {
    const response = await send(`${card}/move`, 'POST', { parent: 'root' });

    expect(response.status).toBe(200);
    expect((await ws.cards.details(card)).parent).toBe('root');
    expect(await children('decision_5')).not.toContain(card);
  });

  test('moves the card under another parent at a position', async () => {
    const [{ key: sibling }] = await ws.cards.create(
      'decision/templates/decision',
      'decision_6',
    );

    const response = await send(`${card}/move`, 'POST', {
      parent: 'decision_6',
      index: 0,
    });

    expect(response.status).toBe(200);
    expect((await ws.cards.details(card)).parent).toBe('decision_6');
    expect((await rank(card)) < (await rank(sibling))).toBe(true);
  });

  // The move and its position are one data-handler write, not a move and a
  // separate rank.
  test('moves the card to a position in one write', async () => {
    const cards = Object.getPrototypeOf(ws.cards);
    const move = vi.spyOn(cards, 'move');
    const rankAt = vi.spyOn(cards, 'rankAt');
    try {
      const response = await send(`${card}/move`, 'POST', {
        parent: 'decision_6',
        index: 0,
      });

      expect(response.status).toBe(200);
      expect(move.mock.calls).toEqual([[card, 'decision_6', 0]]);
      expect(rankAt).not.toHaveBeenCalled();
    } finally {
      move.mockRestore();
      rankAt.mockRestore();
    }
  });

  test.each([
    {},
    { index: 0 },
    { parent: 'root', index: 1.5 },
    { parent: 'root', index: -1 },
  ])('refuses the body %j', async (body) => {
    expect((await send(`${card}/move`, 'POST', body)).status).toBe(400);
  });
});

describe('PUT /cards/:key/links', () => {
  const linkType = 'decision/linkTypes/test';
  const links = async (key: string) =>
    (await ws.cards.details(key)).metadata?.links;

  test('changes the link given by the previous fields into the new one', async () => {
    await ws.cards.addLink('decision_5', 'decision_6', linkType);

    const response = await send('decision_5/links', 'PUT', {
      toCard: 'decision_6',
      linkType,
      direction: 'inbound',
      description: 'why',
      previousToCard: 'decision_6',
      previousLinkType: linkType,
      previousDirection: 'outbound',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: 'Link updated successfully',
    });
    expect(await links('decision_5')).toEqual([]);
    expect(await links('decision_6')).toEqual([
      { linkType, cardKey: 'decision_5', linkDescription: 'why' },
    ]);
  });
});
