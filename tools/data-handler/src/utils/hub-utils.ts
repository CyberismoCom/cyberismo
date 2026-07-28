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
  // Trailing slashes are counted off by hand rather than matched by regex:
  // matching a run of them against an end anchor backtracks from every start
  // position, so a location full of slashes would take quadratic time.
  const withoutTrailingSlashes = (value: string) => {
    let end = value.length;
    while (end > 0 && value[end - 1] === '/') {
      end -= 1;
    }
    return value.slice(0, end);
  };

  // Only a whole trailing segment names the file: a location such as
  // 'https://host/hub/vendor-moduleList.json' is a directory like any other.
  const fileSegment = `/${MODULE_LIST_FILE}`;
  const trimmed = withoutTrailingSlashes(location.trim());
  const directory = withoutTrailingSlashes(
    trimmed.endsWith(fileSegment)
      ? trimmed.slice(0, -fileSegment.length)
      : trimmed,
  );
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
