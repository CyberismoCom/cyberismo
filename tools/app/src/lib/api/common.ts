// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { SWRConfiguration } from 'swr';
import useSWR from 'swr';

import type { Resources, ResourceName, SwrResult } from './types';
import { useUpdating } from '../hooks';
import { ApiCallError } from '../swr';

/**
 * A failed request is reported as `error` only when there is nothing to show:
 * the first load failed, or the resource is gone (404). A failed refresh keeps
 * the last data on screen, with any unsaved edits a view holds over it; SWR
 * retries on its own.
 */
function viewError(error: unknown, hasData: boolean) {
  if (!hasData) return error;
  return error instanceof ApiCallError && error.response.status === 404
    ? error
    : undefined;
}

export function useSWRHook<T extends ResourceName, InitialData = null>(
  swrKey: string | null,
  name: T,
  initialData?: InitialData,
  options?: SWRConfiguration,
) {
  const { data, error, ...rest } = useSWR<Resources[T]>(swrKey, options);
  const { isUpdating, call } = useUpdating(swrKey);

  return {
    ...rest,
    error: viewError(error, data !== undefined),
    [name]: data || initialData,
    isUpdating,
    callUpdate: <T>(fn: () => Promise<T>, key2?: string): Promise<T> =>
      call(fn, key2),
  } as unknown as SwrResult<T, InitialData>;
}
