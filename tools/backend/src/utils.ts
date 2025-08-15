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
import { createServer } from 'node:net';

/**
 * Runs promises in parallel, but only maxConcurrent at a time.
 * @param promises - Array of promises to run in parallel
 * @param maxConcurrent - Maximum number of promises to run at a time
 * @returns - Promise that resolves when all promises have resolved
 */
export async function runInParallel(
  promises: (() => Promise<unknown>)[],
  maxConcurrent: number = 2,
) {
  const waitingPromises: (() => Promise<unknown>)[] = [];
  const wrappedPromises = promises.map((fn) => async () => {
    await fn();
    const next = waitingPromises.shift();
    if (next) {
      await next();
    }
  });

  const runningPromises = wrappedPromises.slice(0, maxConcurrent);
  waitingPromises.push(...wrappedPromises.slice(maxConcurrent));

  return Promise.all(runningPromises.map((p) => p()));
}
/**
 * Runs a callback and returns the result or undefined if it throws.
 * @param cb - The callback to run.
 * @returns The result of the callback or undefined if it throws.
 */
export async function runCbSafely<T>(
  cb: () => Promise<T> | T,
): Promise<T | undefined> {
  try {
    return await cb();
  } catch {
    // All exceptions are ignored.
  }
}

/**
 * The relative path to the static frontend directory.
 */
export const staticFrontendDirRelative = path.relative(
  process.cwd(),
  path.resolve(import.meta.dirname, 'public'),
);

/**
 * Finds a free port.
 * @param port - The port to start looking for.
 * @param maxAttempts - The maximum number of attempts to find a free port.
 * @returns The free port.
 */
export async function findFreePort(
  minPort: number,
  maxPort: number,
): Promise<number> {
  for (let i = minPort; i < maxPort; i++) {
    try {
      await testPort(i);
      return i;
    } catch (err) {
      if (err instanceof Error && err.message.includes('EADDRINUSE')) {
        console.log(`Port ${i} is already in use, trying next port...`);
      } else {
        throw err;
      }
    }
  }
  throw new Error('Failed to find free port');
}

function testPort(port: number) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(port, () => {
      server.close();
      resolve(true);
    });
    server.on('error', (err) => {
      reject(err);
    });
    setTimeout(() => {
      reject(new Error('Timed out waiting for port to be free'));
    }, 2000);
  });
}
