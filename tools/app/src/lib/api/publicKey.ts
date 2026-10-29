// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import useSWR from 'swr';
import { globalApiPaths } from '../swr';
import { getConfig } from '../utils';

export const usePublicKey = () => {
  const { data, isLoading } = useSWR<{ publicKey: string | null }>(
    getConfig().staticMode ? null : globalApiPaths.publicKey(),
  );
  return {
    publicKey: data?.publicKey ?? null,
    isLoading,
  };
};
