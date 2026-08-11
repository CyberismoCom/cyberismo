/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { useSWRHook } from './common';
import { globalApiPaths } from '../swr';
import { getConfig } from '../utils';
import { useProjectReadOnlyMode } from './projectSettings';
import type { User } from './types';

import type { SWRConfiguration } from 'swr';

const STATIC_READER_USER: User = {
  id: 'static-reader',
  email: '',
  name: '',
  role: 'reader',
};

/**
 * The current user, with their role capped to reader while the project is in
 * read-only mode.
 *
 * Capping here rather than at each permission check mirrors what static mode
 * already does above, and means every `useHasMinRole` / `<Gate>` call site
 * follows without changes. Admins are exempt: they must stay able to turn the
 * mode back off, and the banner is what tells them it is on.
 */
export const useUser = (options?: SWRConfiguration) => {
  const staticMode = getConfig().staticMode;
  const result = useSWRHook<'user', User | null>(
    staticMode ? null : globalApiPaths.user(),
    'user',
    staticMode ? STATIC_READER_USER : null,
    options,
  );
  const readOnlyMode = useProjectReadOnlyMode();

  if (readOnlyMode && result.user && result.user.role !== 'admin') {
    return { ...result, user: { ...result.user, role: 'reader' } };
  }
  return result;
};
