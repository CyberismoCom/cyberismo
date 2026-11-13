// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import useSWR from 'swr';
import type { LinkCandidate } from '@cyberismo/model';
import { callApi, projectApiPaths } from '../swr';

/**
 * Runs the macro's query when mounted. Each request is a full solve: rerun on
 * every mount (the dialog opens), never on focus, reconnect or retry.
 */
export const useLinkCandidates = (query: string, projectPrefix?: string) => {
  const path = projectApiPaths(projectPrefix).linkCandidates();
  const { data, error, isValidating } = useSWR(
    [path, query],
    () => callApi<{ candidates: LinkCandidate[] }>(path, 'POST', { query }),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      // Deduping would skip a quick reopen
      dedupingInterval: 0,
    },
  );
  return { candidates: data?.candidates, error, isValidating };
};
