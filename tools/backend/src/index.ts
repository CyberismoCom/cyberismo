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
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { findFreePort } from './utils.js';
import { createApp } from './app.js';
export { exportSite } from './export.js';

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
  app.get('*', (c) =>
    c.html(
      readFile(path.join(dir, 'index.html')).then((file) => file.toString()),
    ),
  );

  let port = parseInt(process.env.PORT || DEFAULT_PORT.toString(), 10);

  if (findPort) {
    port = await findFreePort(port, DEFAULT_MAX_PORT);
  }
  await startApp(app, port);
}

/**
 * Start the server
 * @param projectPath - Path to the project
 * @param findPort - If true, find a free port
 */
export async function startServer(
  projectPath?: string,
  findPort: boolean = true,
) {
  let port = parseInt(process.env.PORT || DEFAULT_PORT.toString(), 10);

  if (findPort) {
    port = await findFreePort(port, DEFAULT_MAX_PORT);
  }
  const app = createApp(projectPath);
  await startApp(app, port);
}

async function startApp(app: Hono, port: number) {
  // Start server
  serve(
    {
      fetch: app.fetch,
      port: port,
    },
    (info) => {
      console.log(`Running Cyberismo app on http://localhost:${info.port}`);
      console.log('Press Control+C to stop.');
    },
  );
}
