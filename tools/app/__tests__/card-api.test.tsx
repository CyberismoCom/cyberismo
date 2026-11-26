// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { SWRConfig } from 'swr';
import type * as SwrModule from '@/lib/swr';
import type * as SwrLib from 'swr';
import type * as ActionsModule from '@/lib/api/actions';
import rootReducer from '@/lib/slices';

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

vi.mock('@/lib/api/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof ActionsModule>()),
  createLink: vi.fn().mockResolvedValue(undefined),
  addAttachments: vi.fn().mockResolvedValue(undefined),
}));

import {
  ActionLostError,
  deleteCard,
  runAction,
  updateCard,
  useCardMutations,
} from '@/lib/api/card';
import { ApiCallError } from '@/lib/swr';
import { useAttachments } from '@/lib/api/attachments';

const base = '/api/projects/TST';
const card = `${base}/cards/TST_1`;
const content = `${card}/content`;
const source = `${card}/source`;
const tree = `${base}/tree`;
const resourceTree = `${base}/resources/tree`;

function hook<T>(
  use: () => T,
  store = configureStore({ reducer: rootReducer }),
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <SWRConfig value={{ fetcher: () => new Promise(() => {}) }}>
        {children}
      </SWRConfig>
    </Provider>
  );
  return renderHook(use, { wrapper }).result.current;
}

beforeEach(() => {
  callApi.mockClear();
  mutate.mockReset();
});

describe('card mutations', () => {
  it.each([
    {
      action: 'updateCard metadata',
      run: () => updateCard('TST_1', { metadata: { title: 'x' } }, 'TST'),
      keys: [card, content, source, tree, resourceTree],
    },
    {
      action: 'deleteCard',
      run: () => deleteCard('TST_1', 'TST'),
      keys: [card, content, source, tree, resourceTree],
    },
    {
      action: 'createLink',
      run: () =>
        hook(() => useCardMutations('TST_1', 'TST')).createLink(
          'TST_2',
          'relates',
        ),
      keys: [card, content],
    },
    {
      action: 'addAttachments',
      run: () =>
        hook(() => useAttachments('TST_1', undefined, 'TST')).addAttachments(
          [],
        ),
      keys: [source, content],
    },
  ])('$action revalidates its card entries', async ({ run, keys }) => {
    await run();

    expect(mutate.mock.calls.map((call) => call[0]).sort()).toEqual(
      [...keys].sort(),
    );
  });

  it('resolves a content save only after the new body is fetched', async () => {
    let fetched!: () => void;
    mutate.mockImplementation((key: string) =>
      key === content
        ? new Promise<void>((resolve) => (fetched = resolve))
        : Promise.resolve(),
    );
    const pending = Symbol('pending');
    const save = updateCard('TST_1', { content: 'x' }, 'TST');

    await vi.waitFor(() => expect(fetched).toBeDefined());
    expect(await Promise.race([save, Promise.resolve(pending)])).toBe(pending);
    fetched();
    await expect(save).resolves.toBeUndefined();
  });
});

describe('runAction', () => {
  const action = `${card}/action`;
  // Mounted card keys are matched by a function; the rest by name.
  const mutated = () =>
    mutate.mock.calls.map(([key]) =>
      typeof key === 'function' ? 'mounted cards' : key,
    );

  it('posts the programs and refreshes the tree and the cards', async () => {
    callApi.mockResolvedValueOnce({ created: [] });

    expect(await runAction('TST_1', ['a.'], 'TST')).toEqual({ created: [] });
    expect(callApi).toHaveBeenCalledWith(action, 'POST', { programs: ['a.'] });
    expect(mutated()).toEqual([tree, 'mounted cards']);
    // The source too: the card editor shows it.
    const [mounted] = mutate.mock.calls[1];
    expect(mounted(card)).toBe(true);
    expect(mounted(source)).toBe(true);
  });

  it('marks the cards it created as recently created, from the hook', async () => {
    const store = configureStore({ reducer: rootReducer });
    callApi.mockResolvedValueOnce({
      created: [{ key: 'TST_2', title: 'New' }],
    });

    await hook(() => useCardMutations('TST_1', 'TST'), store).runAction(['a.']);

    expect(store.getState().card.recentlyCreated).toEqual(['TST_2']);
  });

  it('refreshes after an error answer and passes it on', async () => {
    const error = new ApiCallError(new Response(null, { status: 400 }), 'no');
    callApi.mockRejectedValueOnce(error);

    await expect(runAction('TST_1', ['a.'], 'TST')).rejects.toBe(error);
    expect(mutated()).toEqual([tree, 'mounted cards']);
  });

  it.each([
    [true, [tree, 'mounted cards']],
    [false, []],
  ])(
    'says the answer was lost, refreshing only a reachable server: %s',
    async (reachable, refreshed) => {
      callApi.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      if (reachable) callApi.mockResolvedValueOnce({});
      else callApi.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const error = await runAction('TST_1', ['a.'], 'TST').catch(
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(ActionLostError);
      expect((error as ActionLostError).refreshed).toBe(reachable);
      expect(callApi).toHaveBeenLastCalledWith(card, 'GET');
      expect(mutated()).toEqual(refreshed);
    },
  );
});
