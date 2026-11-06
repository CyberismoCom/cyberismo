// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initConfig } from '@/lib/utils';
import { cardFetcher } from '@/lib/api/card-batch';
import { projectApiPaths } from '@/lib/swr';

const cards = '/api/projects/TST/cards';
const row = (key: string) => ({ key });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const fetchMock = vi.fn<typeof fetch>();

// Loads the app config through the real initConfig, then restores fetchMock.
async function loadConfig(staticMode: boolean) {
  vi.stubGlobal(
    'fetch',
    async () => new Response(JSON.stringify({ staticMode })),
  );
  await initConfig();
  vi.stubGlobal('fetch', fetchMock);
}

function requests() {
  return fetchMock.mock.calls.map(([url, init]) => [
    url,
    init?.method,
    init?.body ?? null,
  ]);
}

beforeEach(async () => {
  fetchMock.mockReset();
  await loadConfig(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cardFetcher', () => {
  it('sends concurrent reads as one batch POST', async () => {
    fetchMock.mockResolvedValue(json({ A_1: row('A_1'), A_2: row('A_2') }));

    const results = await Promise.all([
      cardFetcher(`${cards}/A_1`),
      cardFetcher(`${cards}/A_2`),
    ]);

    expect(results).toEqual([row('A_1'), row('A_2')]);
    expect(requests()).toEqual([
      [`${cards}/batch`, 'POST', JSON.stringify({ keys: ['A_1', 'A_2'] })],
    ]);
  });

  it('splits more than 100 concurrent reads into batches of 100', async () => {
    fetchMock.mockImplementation(async (_, init) => {
      const { keys } = JSON.parse(String(init?.body)) as { keys: string[] };
      return json(Object.fromEntries(keys.map((key) => [key, row(key)])));
    });
    const keys = Array.from({ length: 101 }, (_, i) => `A_${i}`);

    await Promise.all(keys.map((key) => cardFetcher(`${cards}/${key}`)));

    expect(
      fetchMock.mock.calls.map(
        ([, init]) => JSON.parse(String(init?.body)).keys.length,
      ),
    ).toEqual([100, 1]);
  });

  it('keeps a hostile card key inside the cards path and sends it decoded', async () => {
    const { card } = projectApiPaths('TST');
    fetchMock.mockResolvedValue(
      json({ '../../x': row('../../x'), A_1: row('A_1') }),
    );

    await Promise.all([cardFetcher(card('../../x')), cardFetcher(card('A_1'))]);

    expect(requests()).toEqual([
      [`${cards}/batch`, 'POST', JSON.stringify({ keys: ['../../x', 'A_1'] })],
    ]);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(json(row('../../x')));
    await cardFetcher(card('../../x'));
    expect(requests()).toEqual([[`${cards}/..%2F..%2Fx`, 'GET', null]]);
  });

  it('reads each card with GET in static mode', async () => {
    await loadConfig(true);
    fetchMock.mockImplementation(async () => json(row('A_1')));

    await Promise.all([
      cardFetcher(`${cards}/A_1`),
      cardFetcher(`${cards}/A_2`),
    ]);

    expect(requests()).toEqual([
      [`${cards}/A_1.json`, 'GET', null],
      [`${cards}/A_2.json`, 'GET', null],
    ]);
  });

  it.each([
    {
      name: 'a key the batch leaves out',
      response: json({ A_1: row('A_1') }),
      rejected: { A_2: 'Card A_2 not found from project' },
    },
    {
      name: 'a failed batch',
      response: json({ error: 'boom' }, 500),
      rejected: { A_1: 'boom', A_2: 'boom' },
    },
  ])('rejects the waiting reads on $name', async ({ response, rejected }) => {
    fetchMock.mockResolvedValue(response);

    const results = await Promise.allSettled([
      cardFetcher(`${cards}/A_1`),
      cardFetcher(`${cards}/A_2`),
    ]);

    const reasons = Object.fromEntries(
      results.flatMap((result, index) =>
        result.status === 'rejected'
          ? [[`A_${index + 1}`, (result.reason as Error).message]]
          : [],
      ),
    );
    expect(reasons).toEqual(rejected);
  });
});
