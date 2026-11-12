// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type * as SwrModule from '@/lib/swr';

const callApi = vi.fn().mockResolvedValue({ candidates: [] });
vi.mock('@/lib/swr', async (importOriginal) => {
  const actual = await importOriginal<typeof SwrModule>();
  return { ...actual, callApi: (...args: unknown[]) => callApi(...args) };
});

import { useLinkCandidates } from '@/lib/api/linkCandidates';

describe('useLinkCandidates', () => {
  it('reruns the query on every mount', async () => {
    let state: ReturnType<typeof useLinkCandidates> | undefined;
    const Probe = () => {
      state = useLinkCandidates('q', 'TST');
      return null;
    };
    // One cache for both mounts, as in the app
    const tree = (mounted: boolean) => (
      <SWRConfig value={{ provider: () => new Map() }}>
        {mounted && <Probe />}
      </SWRConfig>
    );
    const { rerender } = render(tree(true));
    await waitFor(() => expect(callApi).toHaveBeenCalledTimes(1));
    rerender(tree(false));
    callApi.mockReturnValueOnce(new Promise(() => {}));
    rerender(tree(true));
    await waitFor(() => expect(callApi).toHaveBeenCalledTimes(2));
    expect(state?.isValidating).toBe(true);
  });
});
