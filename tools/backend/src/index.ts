// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { serve } from '@hono/node-server';
import type { Env, Schema } from 'hono';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { findFreePort } from './utils.js';
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
const DEFAULT_MAX_PORT = DEFAULT_PORT + 100;

/**
 * Preview the exported site
 * @param dir - Directory to preview
 * @param findPort - If true, find a free port
 */
export async function previewSite(dir: string, findPort: boolean = true) {
  const app = new Hono();
  app.use(serveStatic({ root: dir }));
  app.get('*', async (c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: 'Resource not found' }, 404);
    }
    const file = await readFile(path.join(dir, 'index.html'));
    return c.html(file.toString());
  });

  let port = parseInt(process.env.PORT || DEFAULT_PORT.toString(), 10);

  if (findPort) {
    port = await findFreePort(port, DEFAULT_MAX_PORT);
  }
  await startApp(app, port);
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
 * Starts the server. It listens on PORT (the next free one from it) and
 * HOST, or on a port the system assigns with CYBERISMO_E2E_OSPORT=true.
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
    : await findFreePort(
        parseInt(process.env.PORT || DEFAULT_PORT.toString(), 10),
        DEFAULT_MAX_PORT,
      );
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
  // Liveness for a container healthcheck: the process serves HTTP. Nothing
  // else is checked, so an outage of a dependency does not restart it.
  app.get('/livez', (c) => c.json({ status: 'ok' }));
  return { port: await startApp(app, port), failed };
}

// Resolves once the server listens, with the port it listens on.
function startApp<E extends Env, S extends Schema, P extends string>(
  app: Hono<E, S, P>,
  port: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = serve(
      {
        fetch: app.fetch,
        port: port,
        hostname: process.env.HOST || '127.0.0.1',
      },
      (info) => {
        server.off('error', reject);
        console.log(`Running Cyberismo app on http://localhost:${info.port}`);
        console.log('Press Control+C to stop.');
        // When spawned with stdio: [..., 'ipc'], publish the bound port to the parent.
        // No-op in normal startup (process.send is undefined without an IPC channel).
        process.send?.({ type: 'listening', port: info.port });
        resolve(info.port);
      },
    );
    server.once('error', reject);
  });
}
