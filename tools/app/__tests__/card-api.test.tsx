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

import { deleteCard, updateCard, useCardMutations } from '@/lib/api/card';
import { useAttachments } from '@/lib/api/attachments';

const base = '/api/projects/TST';
const card = `${base}/cards/TST_1`;
const content = `${card}/content`;
const source = `${card}/source`;
const tree = `${base}/tree`;
const resourceTree = `${base}/resources/tree`;

function hook<T>(use: () => T) {
  const store = configureStore({ reducer: rootReducer });
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
      action: 'updateCard content',
      run: () => updateCard('TST_1', { content: 'x' }, 'TST'),
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
    let resolved = false;
    const save = updateCard('TST_1', { content: 'x' }, 'TST').then(() => {
      resolved = true;
    });

    await vi.waitFor(() => expect(fetched).toBeDefined());
    await new Promise((resolve) => setTimeout(resolve));
    expect(resolved).toBe(false);
    fetched();
    await save;
    expect(resolved).toBe(true);
  });
});
