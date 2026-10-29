// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useSWRHook } from './common';
import { globalApiPaths } from '../swr';
import { getConfig } from '../utils';
import type { User } from './types';

import type { SWRConfiguration } from 'swr';

const STATIC_READER_USER: User = {
  id: 'static-reader',
  email: '',
  name: '',
  role: 'reader',
};

export const useUser = (options?: SWRConfiguration) => {
  const staticMode = getConfig().staticMode;
  return useSWRHook<'user', User | null>(
    staticMode ? null : globalApiPaths.user(),
    'user',
    staticMode ? STATIC_READER_USER : null,
    options,
  );
};
