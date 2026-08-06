import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as SwrModule from '@/lib/swr';
import type * as SwrLib from 'swr';

const callApi = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/swr', async (importOriginal) => {
  const actual = await importOriginal<typeof SwrModule>();
  return { ...actual, callApi: (...args: unknown[]) => callApi(...args) };
});

const mutate = vi.fn();
vi.mock('swr', async (importOriginal) => {
  const actual = await importOriginal<typeof SwrLib>();
  return { ...actual, mutate: (...args: unknown[]) => mutate(...args) };
});

import { deleteCard } from '@/lib/api/card';

describe('deleteCard', () => {
  beforeEach(() => {
    callApi.mockClear();
    mutate.mockClear();
  });

  it('revalidates the resource tree so the config nav drops the deleted card', async () => {
    await deleteCard('TEMPL_1', 'TST');

    expect(mutate).toHaveBeenCalledWith('/api/projects/TST/resources/tree');
  });

  it('revalidates the card, raw card, and card tree', async () => {
    await deleteCard('TEMPL_1', 'TST');

    expect(mutate).toHaveBeenCalledWith(
      '/api/projects/TST/cards/TEMPL_1',
      undefined,
      false,
    );
    expect(mutate).toHaveBeenCalledWith(
      '/api/projects/TST/cards/TEMPL_1?raw=true',
      undefined,
      false,
    );
    expect(mutate).toHaveBeenCalledWith('/api/projects/TST/tree');
  });
});
