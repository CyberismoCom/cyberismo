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

import { mkdir, readFile } from 'node:fs/promises';

import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from './app.js';
import { cp, writeFile } from 'node:fs/promises';
import {
  runCbSafely,
  runInParallel,
  staticFrontendDirRelative,
} from './utils.js';
import { QueryResult } from '@cyberismo/data-handler/types/queries';
import { Context, Hono, MiddlewareHandler } from 'hono';
import mime from 'mime-types';

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
 * @param exportDir - Directory to export to.
 * @param level - Log level for the operation.
 * @param onProgress - Optional progress callback function.
 */
export async function exportSite(
  projectPath: string,
  exportDir?: string,
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
  onProgress?: (current?: number, total?: number) => void,
) {
  exportDir = exportDir || 'static';

  const app = createApp(projectPath);

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
  await toSsg(app, commands, exportDir, onProgress);
}

async function getRoutes(app: Hono) {
  const routes = new Set<string>();
  for (const route of app.routes) {
    if (route.method === 'GET') routes.add(route.path);
  }

  // handles both routes with and without dynamic parameters
  const filteredRoutes = [];
  for (const route of routes) {
    if (!route.includes(':')) {
      filteredRoutes.push(route);
      continue;
    }
    const response = await createSsgRequest(app, route, true);
    if (response.ok) {
      const params = await response.json();
      if (Array.isArray(params) && params.length > 0) {
        for (const param of params) {
          let newRoute = route;
          for (const [key, value] of Object.entries(param)) {
            newRoute = newRoute.replace(`:${key}`, `${value}`);
          }
          filteredRoutes.push(newRoute);
        }
      }
    }
  }

  return filteredRoutes;
}

/**
 * This is similar to hono's ssg function, but it only calls middlewares once
 * @param app
 * @param onProgress
 */
async function toSsg(
  app: Hono,
  commands: CommandManager,
  dir: string,
  onProgress?: (current?: number, total?: number) => void,
) {
  reset();
  await commands.calculateCmd.generate();

  const promises = [];

  const routes = await getRoutes(app);
  await runCbSafely(() => onProgress?.(0, routes.length));

  let processedFiles = 0;
  let failed = false;
  let errors: Error[] = [];
  const done = async (error?: Error) => {
    if (error) {
      failed = true;
      errors.push(error);
    }
    processedFiles++;
    await runCbSafely(() => onProgress?.(processedFiles, routes.length));
  };
  for (const route of routes) {
    promises.push(async () => {
      try {
        const response = await createSsgRequest(app, route, false);
        if (!response.ok) {
          const error = await response.json();
          if (typeof error === 'object' && error !== null && 'error' in error) {
            await done(
              new Error(`Failed to export route ${route}: ${error.error}`),
            );
          } else {
            await done(new Error(`Failed to export route ${route}`));
          }
          return;
        }
        await writeFileToDir(dir, response, route);
        await done();
      } catch (error) {
        await done(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  await runInParallel(promises, 5);
  if (failed) {
    const message = `Errors:\n${errors.map((e) => e.message).join('\n')}`;
    throw new Error(message);
  }
}

/**
 * Get the file content and file ending for a given response and route.
 * @param response - The response to get the file content and file ending for.
 * @param route - The route to get the file content and file ending for.
 * @returns The file content and file ending for the given response and route.
 * If the route already has a file ending, it will be returned as an empty string.
 */
async function getFileContent(
  response: Response,
  route: string,
): Promise<{
  content: ArrayBuffer;
  fileEnding: string;
}> {
  // Check if route already has an extension
  const routeExtension = path.extname(route);
  if (routeExtension) {
    // Trust the existing extension in the route
    const content = await response.arrayBuffer();
    return {
      content,
      fileEnding: '',
    };
  }

  // No extension in route, fall back to content type detection
  const contentType = response.headers.get('content-type');
  if (!contentType) {
    throw new Error('No content type');
  }
  const extension = mime.extension(contentType);
  if (!extension) {
    throw new Error('Unsupported content type');
  }

  // Use ArrayBuffer for all content types
  const content = await response.arrayBuffer();
  return {
    content,
    fileEnding: `.${extension}`,
  };
}

async function writeFileToDir(dir: string, response: Response, route: string) {
  const { content, fileEnding } = await getFileContent(response, route);

  let filePath = path.join(dir, route);

  // if route does not have a file ending, add it based on the content type
  if (!route.endsWith(fileEnding)) {
    filePath += fileEnding;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(content));
}

// findroutes = if this request is used to find the routes in the app
function createSsgRequest(
  app: Hono,
  route: string,
  findRoutes: boolean = true,
) {
  return app.request(route, {
    headers: new Headers({
      'x-ssg': 'true',
      'x-ssg-find': findRoutes ? 'true' : 'false',
    }),
  });
}

/**
 * Check if the request is a static site generation request.
 * @param c - The context of the request.
 * @returns True if the request is a static site generation request.
 */
export function isSSGContext(c: Context) {
  return c.req.header('x-ssg') === 'true';
}

/**
 * This middleware is used to find the routes in the app.
 * @param fn - The function to call to get the parameters for the route.
 * @returns The middleware handler.
 */
export function ssgParams(
  fn?: (c: Context) => Promise<unknown[]>,
): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.header('x-ssg-find') === 'true') {
      return fn ? c.json(await fn(c)) : c.json([]);
    }
    return next();
  };
}
