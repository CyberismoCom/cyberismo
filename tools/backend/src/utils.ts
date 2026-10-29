// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import path from 'node:path';
import { serve, type ServerType } from '@hono/node-server';

/**
 * The relative path to the static frontend directory.
 */
export const staticFrontendDirRelative = path.relative(
  process.cwd(),
  path.resolve(import.meta.dirname, 'public'),
);

/**
 * Starts the server, moving to the next port while the current one is taken.
 * The bind itself is the check, so a port can't be taken between check and use.
 * @param fetch - Request handler.
 * @param port - The first port to try.
 * @param host - The host to bind.
 * @param maxPort - The last port to try; defaults to `port` (no retry).
 * @returns The listening server and the port it bound.
 */
export function listen(
  fetch: Parameters<typeof serve>[0]['fetch'],
  port: number,
  host: string,
  maxPort: number = port,
): Promise<{ server: ServerType; port: number }> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch, port, hostname: host }, (info) =>
      resolve({ server, port: info.port }),
    );
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && port < maxPort) {
        console.log(`Port ${port} is already in use, trying next port...`);
        resolve(listen(fetch, port + 1, host, maxPort));
      } else {
        reject(err);
      }
    });
  });
}

export function gitOptionsFromEnv(): {
  autocommit: boolean;
  autopush: boolean;
} {
  return {
    autocommit: process.env.CYBERISMO_AUTOCOMMIT === 'true',
    autopush: process.env.CYBERISMO_AUTOPUSH === 'true',
  };
}
