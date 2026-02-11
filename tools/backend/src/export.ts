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
import { MockAuthProvider } from './auth/mock.js';
import { cp, writeFile } from 'node:fs/promises';
import { staticFrontendDirRelative } from './utils.js';
import type { QueryResult } from '@cyberismo/data-handler/types/queries';
import { toSSG } from 'hono/ssg';
import type { TreeOptions } from './types.js';
import {
  findAllCards,
  findRelevantAttachments,
} from './domain/cards/service.js';

let _cardQueryPromise: Promise<QueryResult<'card'>[]> | null = null;
const OVERHEAD_CALLS = 6; // estimated number of overhead calls during export in addition to card exports

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
 * @returns An object containing any errors that occurred during export.
 */
export async function exportSite(
  projectPath: string,
  exportDir?: string,
  options?: TreeOptions,
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
  onProgress?: (current: number, total: number) => void,
): Promise<{ errors: string[] }> {
  exportDir = exportDir || 'static';
  const opts = {
    recursive: false,
    cardKey: undefined,
    ...options,
  };

  const app = createApp(new MockAuthProvider(), projectPath, opts);

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

  // estimate total based on the number of cards to export
  const cards = await findAllCards(commands, opts);
  const attachments = await findRelevantAttachments(commands, opts);
  let total = cards.length + attachments.length + OVERHEAD_CALLS;

  // Actual export with progress reporting
  let done = 0;
  onProgress?.(done, total);
  const errors: string[] = [];
  await toSSG(app, fs, {
    dir: exportDir,
    concurrency: 5,
    plugins: [
      {
        afterResponseHook: async (response) => {
          if (![200, 201, 204].includes(response.status)) {
            const error = await response.json();
            if (
              typeof error === 'object' &&
              error != null &&
              'error' in error &&
              typeof error.error === 'string'
            ) {
              errors.push(error.error);
            }
            return false; // ignore route
          }
          done++;
          if (done > total) {
            total = done; // adjust total if underestimated
          }
          onProgress?.(done, total);
          return response;
        },
      },
    ],
  });
  return {
    errors,
  };
}
