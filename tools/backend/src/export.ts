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

import path from 'node:path';

import fs, { readFile } from 'node:fs/promises';

import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from './app.js';
import { cp, writeFile } from 'node:fs/promises';
import { staticFrontendDirRelative } from './utils.js';
import type { QueryResult } from '@cyberismo/data-handler/types/queries';
import { defaultPlugin, toSSG } from 'hono/ssg';
import type { TreeOptions } from './types.js';

let _cardQueryPromise: Promise<QueryResult<'card'>[]> | null = null;

/**
 *  DO NO USE DIRECTLY. This resets the callOnce map, allowing you to redo the export.
 * Also resets the card query promise.
 */
export function reset() {
  _cardQueryPromise = null;
}

/**
 * Get the card query result for a given card key. Should only be called during
 * static site generation
 * @param projectPath - Path to the project.
 * @param cardKey - Key of the card to get the query result for.
 * @returns The card query result for the given card key.
 */
export async function getCardQueryResult(
  projectPath: string,
  cardKey?: string,
): Promise<QueryResult<'card'>[]> {
  if (!_cardQueryPromise) {
    const commands = await CommandManager.getInstance(projectPath);
    // fetch all cards
    _cardQueryPromise = commands.project.calculationEngine.runQuery(
      'card',
      'exportedSite',
      {},
    );
  }
  return _cardQueryPromise.then((results) => {
    if (!cardKey) {
      return results;
    }
    const card = results.find((r) => r.key === cardKey);
    if (!card) {
      throw new Error(`Card ${cardKey} not found`);
    }
    return [card];
  });
}

/**
 * Export the site to a given directory.
 * Note: Do not call this function in parallel.
 * @param projectPath - Path to the project.
 * @param options - Export options.
 * @param options.recursive - Whether to export cards recursively.
 * @param options.cardKey - Key of the card to export. If not provided, all cards will be exported.
 * @param exportDir - Directory to export to.
 * @param level - Log level for the operation.
 * @param onProgress - Optional progress callback function.
 */
export async function exportSite(
  projectPath: string,
  exportDir?: string,
  options?: TreeOptions,
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
  onProgress?: (current?: number, total?: number) => void,
) {
  exportDir = exportDir || 'static';
  const opts = {
    recursive: false,
    cardKey: undefined,
    ...options,
  };

  const app = createApp(projectPath, opts);

  // copy whole frontend to the same directory
  await cp(staticFrontendDirRelative, exportDir, { recursive: true });
  // read config file and change export to true
  const config = await readFile(path.join(exportDir, 'config.json'), 'utf-8');
  const configJson = JSON.parse(config);
  configJson.staticMode = true;
  await writeFile(
    path.join(exportDir, 'config.json'),
    JSON.stringify(configJson),
  );

  const commands = await CommandManager.getInstance(projectPath, {
    logLevel: level,
  });

  reset();
  await commands.project.calculationEngine.generate();
  // Discovery pass to count total requests
  let total = 0;
  await toSSG(app, fs, {
    dir: exportDir,
    concurrency: 5,
    plugins: [
      defaultPlugin,
      {
        afterResponseHook: () => {
          total++;
          return false;
        },
      },
    ],
  });

  // Actual export with progress reporting
  let done = 0;
  onProgress?.(done, total);
  await toSSG(app, fs, {
    dir: exportDir,
    concurrency: 5,
    plugins: [
      defaultPlugin,
      {
        afterResponseHook: (response) => {
          done++;
          onProgress?.(done, total);
          return response;
        },
      },
    ],
  });
}
