/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { join, resolve } from 'node:path';

import {
  pathExists,
  resolveTilde,
} from '@cyberismo/data-handler/utils/file-utils';

// Nearest folder at or above 'path' that holds '.cards'; '' if none.
function findProjectRoot(path: string): string {
  if (pathExists(resolve(join(path, '.cards')))) {
    return path;
  }
  const parentPath = resolve(path, '..');
  return parentPath === path ? '' : findProjectRoot(parentPath);
}

/**
 * Resolves the project root: '-p' if given, otherwise the nearest project
 * above the current directory. Exits when there is neither.
 * @returns the project path, or '' when it is not a project (it lacks
 * '.cards' or 'cardRoot').
 */
export function openProject(options: { projectPath?: string }): string {
  let path = options.projectPath;
  if (!path) {
    path = findProjectRoot(process.cwd());
    if (path === '') {
      console.error(
        'No path defined with "-p" flag and could not find project. Sorry.',
      );
      process.exit(1);
    }
  }
  path = resolveTilde(path);
  const isProject =
    pathExists(resolve(join(path, '.cards'))) &&
    pathExists(resolve(join(path, 'cardRoot')));
  return isProject ? path : '';
}
