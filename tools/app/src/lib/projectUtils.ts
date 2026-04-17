/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { getSwrConfig, apiPaths } from './swr.js';

/**
 * Fetch the list of available project prefixes.
 * Currently uses GET /api/project (single project) and returns a one-element array.
 * TODO: Replace with GET /api/projects when multi-project backend is available.
 */
export async function fetchAvailableProjects(): Promise<string[]> {
  const { fetcher } = getSwrConfig();
  const { cardKeyPrefix: prefix } = (await fetcher!(apiPaths.project())) as {
    cardKeyPrefix?: string;
  };
  return prefix ? [prefix] : [];
}
