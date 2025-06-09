import path from 'node:path';
import { createServer } from 'node:net';

/**
 * Runs promises in parallel, but only maxConcurrent at a time.
 * @param promises - Array of promises to run in parallel
 * @param maxConcurrent - Maximum number of promises to run at a time
 * @returns - Promise that resolves when all promises have resolved
 */
export async function runInParallel<T>(
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

export async function runCbSafely<T>(
  cb: () => Promise<T> | T,
): Promise<T | undefined> {
  try {
    return await cb();
  } catch {}
}

export const staticFrontendDirRelative = path.relative(
  process.cwd(),
  path.resolve(import.meta.dirname, 'public'),
);

export async function findFreePort(
  port: number,
  maxAttempts: number = 100,
): Promise<number> {
  for (let i = port; i < port + maxAttempts; i++) {
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
