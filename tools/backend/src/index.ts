// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Context, Env, Schema } from 'hono';
import { Hono } from 'hono';
import path from 'node:path';
import { frontendFallback, serveFrontend } from './frontend.js';
import { listen } from './utils.js';
import { startPolicyPolling } from './overlay.js';
import { createApp } from './app.js';
import type { AuthProvider } from './auth/types.js';
import {
  localFolder,
  type LogicBackendFactory,
  type ProjectDirectory,
} from '@cyberismo/data-handler';
import type { ProjectErrors } from '@cyberismo/model';
export { MockAuthProvider } from './auth/mock.js';
export type { MockUserConfig } from './auth/mock.js';
export type { AuthProvider } from './auth/types.js';
export { exportSite, type ExportSiteOptions } from './export.js';

const DEFAULT_PORT = 3000;
const MAX_PORT_ATTEMPTS = 100;

// Node's fs refuses a NUL in a path, so the lookup misses and serveStatic
// falls through; a decoded %00 misses the same way.
const MISS = '\0';

// serveStatic only decodeURI's the path, leaving %23, %26 etc. encoded, and
// checks for traversal before the rewrite. Decode the raw URL once, as nginx
// and Express's send do, and serve it only if it lands inside the root.
function staticPathWithin(root: string, c: Context): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(new URL(c.req.url).pathname);
  } catch {
    return MISS;
  }
  const rel = path.relative(root, path.join(root, decoded));
  const inside =
    rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
  return inside ? rel : MISS;
}

/**
 * Build the app that serves an exported site
 * @param dir - Directory to serve
 */
export function createPreviewApp(dir: string) {
  const app = new Hono();
  app.use(
    serveFrontend(dir, {
      // staticPathWithin decodes once and keeps the path inside the root, and
      // no route middleware runs before this, so encoded names are safe here.
      allowPercentInPath: true,
      rewriteRequestPath: (_, c) => staticPathWithin(dir, c),
    }),
  );
  app.get('*', async (c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: 'Resource not found' }, 404);
    }
    return frontendFallback(c, path.join(dir, 'index.html'));
  });
  return app;
}

/**
 * Preview the exported site
 * @param dir - Directory to preview
 * @param findPort - If true, find a free port
 */
export async function previewSite(dir: string, findPort: boolean = true) {
  const app = createPreviewApp(dir);
  const port = parseInt(process.env.PORT || DEFAULT_PORT.toString(), 10);
  await startApp(app, port, findPort);
}

/** Where the server finds its projects. */
export interface ServerConfig {
  /** A project, or a folder of projects. */
  projectPath: string;
  /** `projectPath` is a folder that new projects are created in. */
  multiProject?: boolean;
  /** Git-backed writes, when the server opens the projects. */
  autocommit?: boolean;
  /** Push each autocommit, when the server opens the projects. */
  autopush?: boolean;
}

/** What the server is composed of. */
export interface ServerParts {
  auth: AuthProvider;
  /** The projects, opened already; when unset the server opens them. */
  directory?: ProjectDirectory;
  /** The logic backend of each project the server opens; clingo when unset. */
  logic?: LogicBackendFactory;
}

/** A running server. */
export interface Server {
  /** The port it listens on. */
  port: number;
  /** The projects that failed to open, when the server opened them. */
  failed: ProjectErrors[];
}

/**
 * Starts the server. It listens on PORT (or the next free port after it)
 * and HOST, or on a port the system assigns with CYBERISMO_E2E_OSPORT=true.
 * @throws if a directory is given with git options or a logic backend, if
 *   the projects cannot be scanned, or if the server cannot listen.
 */
export async function createServer(
  config: ServerConfig,
  parts: ServerParts,
): Promise<Server> {
  if (
    parts.directory &&
    (parts.logic || config.autocommit || config.autopush)
  ) {
    throw new Error(
      'createServer: a logic backend and git options apply only when the server opens the projects',
    );
  }
  let directory = parts.directory;
  let failed: ProjectErrors[] = [];
  if (!directory) {
    ({ directory, failed } = await localFolder(config.projectPath, {
      autocommit: config.autocommit,
      autopush: config.autopush,
      logic: parts.logic,
    }));
  }
  const projects = directory;
  const useOsAssigned = process.env.CYBERISMO_E2E_OSPORT === 'true';
  const port = useOsAssigned
    ? 0
    : parseInt(process.env.PORT || DEFAULT_PORT.toString(), 10);
  startPolicyPolling(async () =>
    (await projects.list()).map((p) => ({ prefix: p.prefix })),
  );
  const app = createApp(
    parts.auth,
    projects,
    undefined,
    undefined,
    config.multiProject ? config.projectPath : undefined,
  );
  return { port: await startApp(app, port, !useOsAssigned), failed };
}

// Resolves with the port the server listens on.
async function startApp<E extends Env, S extends Schema, P extends string>(
  app: Hono<E, S, P>,
  port: number,
  findPort: boolean,
): Promise<number> {
  const bound = await listen(
    app.fetch,
    port,
    process.env.HOST || '127.0.0.1',
    findPort ? port + MAX_PORT_ATTEMPTS : port,
  );
  console.log(`Running Cyberismo app on http://localhost:${bound.port}`);
  console.log('Press Control+C to stop.');
  // When spawned with stdio: [..., 'ipc'], publish the bound port to the parent.
  // No-op in normal startup (process.send is undefined without an IPC channel).
  process.send?.({ type: 'listening', port: bound.port });
  return bound.port;
}
