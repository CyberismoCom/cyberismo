/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.

  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Find project root by looking for .cards directory
 */
function findProjectRoot(startDir: string): string | undefined {
  let currentDir = resolve(startDir);
  const root = resolve('/');

  while (currentDir !== root) {
    if (existsSync(join(currentDir, '.cards'))) {
      return currentDir;
    }
    currentDir = resolve(currentDir, '..');
  }

  return undefined;
}

/**
 * Get the project path from CLI args, environment variable, or auto-detect
 *
 * Priority:
 * 1. CLI argument: --project-path=/path/to/project
 * 2. Environment variable: CYBERISMO_PROJECT_PATH
 * 3. Auto-detect from current working directory
 */
export function getProjectPath(): string | undefined {
  // Check CLI arguments
  const cliArg = process.argv.find((arg) => arg.startsWith('--project-path='));
  if (cliArg) {
    const path = cliArg.substring(cliArg.indexOf('=') + 1);
    if (path && existsSync(path)) {
      return resolve(path);
    }
  }

  // Check environment variable
  const envPath = process.env.CYBERISMO_PROJECT_PATH;
  if (envPath && existsSync(envPath)) {
    return resolve(envPath);
  }

  // Auto-detect from current working directory
  return findProjectRoot(process.cwd());
}
