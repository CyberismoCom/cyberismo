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

import path from 'node:path';

import fs, { readFile } from 'node:fs/promises';

import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from './app.js';
import { cp, writeFile } from 'node:fs/promises';
import { staticFrontendDirRelative } from './utils.js';
import { toSSG } from 'hono/ssg';
import { QueryResult } from '@cyberismo/data-handler/types/queries';

// As long as hono makes multiple calls to the route handlers, we need to
// make sure that calls are only made once
// Create a wrapper that will call the underlying function only once
// Until the reset function is called

let _callOnceMap: Map<string, Promise<unknown>> = new Map();

/**
 * Wraps a function to call it only once. NOTE: Using same key with different functions
 * leads to types being inconsistent.
 * @param fn The function to wrap.
 * @param key The key to use to identify the function.
 * @returns A function that will call the underlying function only once.
 */
export function callOnce<T, U extends unknown[]>(
  fn: (...args: U) => Promise<T>,
  key: string,
): () => Promise<T> {
  return async (...args: U) => {
    if (!_callOnceMap.has(key)) {
      _callOnceMap.set(key, fn(...args));
    }
    return _callOnceMap.get(key) as Promise<T>;
  };
}

let _cardQueryPromise: Promise<QueryResult<'card'>[]> | null = null;

/**
 * This resets the callOnce map, allowing you to redo the export.
 * Also resets the card query promise.
 */
function reset() {
  _callOnceMap.clear();
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
    _cardQueryPromise = commands.calculateCmd.runQuery('card', {});
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
 * @param dir - Directory to export to.
 * @param level - Log level for the operation.
 * @param onProgress - Optional progress callback function.
 */
export async function exportSite(
  projectPath: string,
  dir?: string,
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
  onProgress?: (current?: number, total?: number) => void,
) {
  reset(); // Just in case
  try {
    dir = dir || 'static';

    // replace with logger
    const app = createApp(projectPath);

    const commands = await CommandManager.getInstance(projectPath, level);
    await commands.calculateCmd.generate();

    // Find out how many files are in the project
    const cardQueryResult = await getCardQueryResult(projectPath);
    let totalFiles = cardQueryResult.length;

    // copy whole frontend to the same directory
    await cp(staticFrontendDirRelative, dir, { recursive: true });
    // read config file and change export to true
    const config = await readFile(path.join(dir, 'config.json'), 'utf-8');
    const configJson = JSON.parse(config);
    configJson.export = true;
    await writeFile(
      path.join(dir, 'config.json'),
      JSON.stringify(configJson, null, 2),
    );

    let processedFiles = 0;

    // at last
    await toSSG(app, fs, {
      dir,
      afterResponseHook: (res) => {
        if (res.ok) {
          if (res.headers.get('content-type') === 'image/png') {
            // Attachments are not counted
            totalFiles++;
          }
          processedFiles++; // this is not exactly the number of files as it includes all ssg files, but it's good enough
          onProgress?.(processedFiles, totalFiles + 5); // 2*2 for two extra routes and 1 for the :id call made by hono
        }
        return res;
      },
    });
  } finally {
    reset();
  }
}
