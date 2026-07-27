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

export const MODULE_LIST_FILE = 'moduleList.json';

/**
 * A hub location is the directory holding moduleList.json.
 *
 * The trailing slash is not cosmetic: resolving the file against a location
 * without one replaces the last path segment, so 'https://host/hub' would look
 * for 'https://host/moduleList.json'. Locations are therefore stored in one
 * canonical form, and a URL pointing at the file itself is accepted as naming
 * the directory that contains it.
 * @param location Hub location as given by a user or read from configuration.
 * @returns the location as a directory URL ending in a slash, or an empty
 *          string when nothing is left of it.
 */
export function canonicalHubLocation(location: string): string {
  const directory = location
    .trim()
    .replace(new RegExp(`/?${MODULE_LIST_FILE}$`), '')
    .replace(/\/+$/, '');
  return directory ? `${directory}/` : '';
}

/**
 * Builds the URL of a hub's module list, whichever form the location is in.
 * @param location Hub location.
 * @returns URL of the hub's moduleList.json.
 */
export function hubModuleListUrl(location: string): URL {
  return new URL(MODULE_LIST_FILE, canonicalHubLocation(location));
}
