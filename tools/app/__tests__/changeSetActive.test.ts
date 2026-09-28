import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadActiveChangeSet } from '@/lib/api/changesets';
import { store } from '@/lib/store';
import { setActiveChangeSet } from '@/lib/slices/changeSet';
import { ApiCallError, callApi } from '@/lib/swr';

const failing = () =>
  vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('{"error":"down"}', { status: 503 }));

describe('the active changeset', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    store.dispatch(setActiveChangeSet({ prefix: 'TST', id: null }));
  });

  it('follows the server', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ changeSet: { id: 'cs9', title: 'Nine' } }),
    );
    expect(await loadActiveChangeSet('TST')).toBe('cs9');
    expect(store.getState().changeSet.activeByPrefix.TST).toBe('cs9');
  });

  it('keeps what is known when the server cannot be asked', async () => {
    store.dispatch(setActiveChangeSet({ prefix: 'TST', id: 'cs1' }));
    failing();
    expect(await loadActiveChangeSet('TST')).toBe('cs1');
    expect(store.getState().changeSet.activeByPrefix.TST).toBe('cs1');
  });

  it('does not assume the project when nothing is known', async () => {
    failing();
    await expect(loadActiveChangeSet('UNKNOWN')).rejects.toBeInstanceOf(
      ApiCallError,
    );
    expect(store.getState().changeSet.activeByPrefix.UNKNOWN).toBeUndefined();
  });

  it('carries the reason a write was refused', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        { error: 'You are working in changeset "X"', code: 'changeset-active' },
        { status: 409 },
      ),
    );
    await expect(
      callApi('/api/projects/TST/cards/TST_1', 'PATCH', {}),
    ).rejects.toMatchObject({ code: 'changeset-active' });
  });
});
