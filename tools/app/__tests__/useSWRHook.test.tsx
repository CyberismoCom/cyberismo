// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { SWRConfig } from 'swr';
import rootReducer from '@/lib/slices';
import { ApiCallError } from '@/lib/swr';
import { useSWRHook } from '@/lib/api/common';

// Views replace themselves with `loadError`, so a failed refresh must not
// surface there while the last data is still on screen.

const notFound = new ApiCallError(new Response(null, { status: 404 }));
const serverError = new ApiCallError(new Response(null, { status: 500 }));
const networkDrop = new TypeError('Failed to fetch');
const tree = [{ key: 'c1' }];

function renderTree(responses: Array<unknown>) {
  const fetcher = async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  const store = configureStore({ reducer: rootReducer });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <SWRConfig
        value={{
          fetcher,
          provider: () => new Map(),
          dedupingInterval: 0,
          shouldRetryOnError: false,
        }}
      >
        {children}
      </SWRConfig>
    </Provider>
  );
  return renderHook(() => useSWRHook('/tree', 'tree'), { wrapper }).result;
}

async function refresh(result: ReturnType<typeof renderTree>) {
  await act(async () => {
    await result.current.mutate().catch(() => {});
  });
}

describe('useSWRHook loadError', () => {
  it('is the failure when the first load fails', async () => {
    const result = renderTree([serverError]);
    await waitFor(() => expect(result.current.loadError).toBe(serverError));
    expect(result.current.tree).toBeUndefined();
  });

  it('stays unset when a refresh fails, while error still reports it', async () => {
    const result = renderTree([tree, networkDrop]);
    await waitFor(() => expect(result.current.tree).toEqual(tree));

    await refresh(result);

    expect(result.current.loadError).toBeUndefined();
    expect(result.current.error).toBe(networkDrop);
    expect(result.current.tree).toEqual(tree);
  });

  it('is the 404 when a loaded resource is gone', async () => {
    const result = renderTree([tree, notFound]);
    await waitFor(() => expect(result.current.tree).toEqual(tree));

    await refresh(result);

    expect(result.current.loadError).toBe(notFound);
  });
});
