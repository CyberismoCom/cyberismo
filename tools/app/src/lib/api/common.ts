// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { SWRConfiguration } from 'swr';
import useSWR from 'swr';

import type { Resources, ResourceName, SwrResult } from './types';
import { useUpdating } from '../hooks';

export function useSWRHook<T extends ResourceName, InitialData = null>(
  swrKey: string | null,
  name: T,
  initialData?: InitialData,
  options?: SWRConfiguration,
) {
  const { data, ...rest } = useSWR<Resources[T]>(swrKey, options);
  const { isUpdating, call } = useUpdating(swrKey);

  return {
    ...rest,
    [name]: data || initialData,
    isUpdating,
    callUpdate: <T>(fn: () => Promise<T>, key2?: string): Promise<T> =>
      call(fn, key2),
  } as unknown as SwrResult<T, InitialData>;
}
