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
  it.each([
    {
      action: 'renameProjectPrefix',
      run: () => renameProjectPrefix('NEW', 'TST'),
      call: [`${base}/project/prefix`, 'PUT', { cardKeyPrefix: 'NEW' }],
    },
    {
      action: 'updateProjectSettings',
      run: () => updateProjectSettings({ name: 'Renamed' }, 'TST'),
      call: [`${base}/project`, 'PATCH', { name: 'Renamed' }],
    },
  ])(
    '$action sends one request and revalidates the settings',
    async ({ run, call }) => {
      await run();

      expect(callApi.mock.calls).toEqual([call]);
      expect(mutate.mock.calls.map(([key]) => key).sort()).toEqual(
        [`${base}/project`, `${base}/resources/tree`].sort(),
      );
    },
  );
});
