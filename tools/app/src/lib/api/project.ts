/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { useSWRHook } from './common';
import { apiPaths } from '../swr';

import type { SWRConfiguration } from 'swr';
import type { CardUpdate } from './types';
import { updateCard } from './card';

/**
 * @deprecated Use useProjectSettings for project configuration. Use resource hooks for resources
 */
export const useProject = (options?: SWRConfiguration) => {
  const { callUpdate, ...rest } = useSWRHook<'project'>(
    apiPaths.cards(),
    'project',
    null,
    options,
  );
  return {
    ...rest,
    updateCard: async (key: string, update: CardUpdate) =>
      await callUpdate(() => updateCard(key, update)),
  };
};
