/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CleanResult } from '@cyberismo/data-handler';
import type * as Swr from 'swr';

const mutate = vi.fn();

vi.mock('swr', async (orig) => ({
  ...(await orig<typeof Swr>()),
  mutate: (...args: unknown[]) => mutate(...args),
}));

import { cleanProject } from '@/lib/api/projectSettings';

const result: CleanResult = {
  findings: [
    { cardKey: 'TST_1', field: 'base/fieldTypes/owner', reason: 'undeclared' },
  ],
  cardCount: 1,
  skippedCards: [],
  failedCards: [],
  dryRun: true,
};

const fetchMock = vi.fn();

const lastRequest = () => {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
    string,
    RequestInit,
  ];
  return { url, init };
};

describe('cleanProject', () => {
  beforeEach(() => {
    mutate.mockClear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => result,
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts an explicit dryRun flag as JSON', async () => {
    await cleanProject(true, 'TST');

    const { url, init } = lastRequest();
    expect(url).toBe('/api/projects/TST/project/clean');
    expect(init.method).toBe('POST');
    // The backend requires the flag and only parses the body when the content
    // type says JSON, so a missing header would fail the request.
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"dryRun":true}');
  });

  it('sends dryRun false for a real clean', async () => {
    await cleanProject(false, 'TST');

    const { init } = lastRequest();
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"dryRun":false}');
  });

  it('returns the findings reported by the backend', async () => {
    expect(await cleanProject(true, 'TST')).toEqual(result);
  });

  it('invalidates the cards and the tree after a real clean', async () => {
    await cleanProject(false, 'TST');

    // Tree columns are calculated from the card field values the clean removed.
    expect(mutate).toHaveBeenCalledWith('/api/projects/TST/tree');
    const cardsPredicate = mutate.mock.calls
      .map(([key]) => key)
      .find((key) => typeof key === 'function');
    expect(cardsPredicate('/api/projects/TST/cards/TST_1')).toBe(true);
    expect(cardsPredicate('/api/projects/TST/workflows')).toBe(false);
  });

  it('invalidates nothing after a dry run', async () => {
    await cleanProject(true, 'TST');

    expect(mutate).not.toHaveBeenCalled();
  });
});
