// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';
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

import {
  renameProjectPrefix,
  updateProjectSettings,
} from '@/lib/api/projectSettings';

const base = '/api/projects/TST';

beforeEach(() => {
  callApi.mockClear();
  mutate.mockReset();
});

describe('project settings writes', () => {
  it('updateProjectSettings sends one request and revalidates the settings', async () => {
    await updateProjectSettings({ name: 'Renamed' }, 'TST');

    expect(callApi.mock.calls).toEqual([
      [`${base}/project`, 'PATCH', { name: 'Renamed' }],
    ]);
    expect(mutate.mock.calls.map(([key]) => key).sort()).toEqual(
      [`${base}/project`, `${base}/resources/tree`].sort(),
    );
  });

  // The project is served under its new prefix only: the old prefix's paths
  // answer 404.
  it('renameProjectPrefix sends one request and revalidates under the new prefix', async () => {
    callApi.mockResolvedValueOnce({ cardKeyPrefix: 'new' });

    expect(await renameProjectPrefix('new', 'TST')).toBe('new');

    expect(callApi.mock.calls).toEqual([
      [`${base}/project/prefix`, 'PUT', { cardKeyPrefix: 'new' }],
    ]);
    expect(mutate.mock.calls.map(([key]) => key).sort()).toEqual(
      [
        '/api/projects',
        '/api/projects/new/project',
        '/api/projects/new/resources/tree',
      ].sort(),
    );
  });
});
