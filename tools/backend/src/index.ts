/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';
import fs, { cp, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';

import { attachCommandManager } from './middleware/commandManager.js';

// Import routes
import cardsRouter from './routes/cards.js';
import fieldTypesRouter from './routes/fieldTypes.js';
import linkTypesRouter from './routes/linkTypes.js';
import templatesRouter from './routes/templates.js';
import treeRouter from './routes/tree.js';

import { toSSG } from 'hono/ssg';
import { CommandManager } from '@cyberismo/data-handler';

const staticFrontendDirRelative = path.relative(
  process.cwd(),
  path.resolve(import.meta.dirname, 'public'),
);

/**
 * Create the Hono app for the backend
 * @param projectPath - Path to the project
 * @param exportMode - If true, the app is in export mode
 */
export function createApp(projectPath?: string, exportMode: boolean = false) {
  const app = new Hono();

  app.use(async (c, next) => {
    c.set('exportMode', exportMode);
    await next();
  });

  app.use('/api', cors());

  app.use(
    '*',
    serveStatic({
      root: staticFrontendDirRelative,
    }),
  );

  // Attach CommandManager to all requests
  app.use(attachCommandManager(projectPath));

  // Wire up routes
  app.route('/api/cards', cardsRouter);
  app.route('/api/fieldTypes', fieldTypesRouter);
  app.route('/api/linkTypes', linkTypesRouter);
  app.route('/api/templates', templatesRouter);
  app.route('/api/tree', treeRouter);

  // serve index.html for all other routes
  app.notFound(async (c) => {
    if (c.req.path.startsWith('/api')) {
      return c.text('Not Found', 400);
    }
    const file = await readFile(
      path.join(import.meta.dirname, 'public', 'index.html'),
    );
    return c.html(file.toString());
  });
  // Error handling
  app.onError((err, c) => {
    console.error(err.stack);
    return c.text('Internal Server Error', 500);
  });

  return app;
}

export async function exportSite(projectPath: string, dir?: string) {
  dir = dir || 'static';
  const app = createApp(projectPath, true);
  const commands = await CommandManager.getInstance(projectPath);
  await commands.calculateCmd.generate();

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
  // at last
  await toSSG(app, fs, {
    dir,
  });
}

/**
 * Preview the exported site
 * @param dir - Directory to preview
 * @param findPort - If true, find a free port
 */
export async function previewSite(dir: string, findPort: boolean = true) {
  const app = new Hono();
  app.use(async (c, next) => {
    c.set('exportMode', true);
    await next();
  });
  app.use(serveStatic({ root: dir }));
  app.get('*', (c) =>
    c.html(
      readFile(path.join(dir, 'index.html')).then((file) => file.toString()),
    ),
  );

  let port = parseInt(process.env.PORT || '3000', 10);

  if (findPort) {
    port = await findFreePort(port);
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
  let port = parseInt(process.env.PORT || '3000', 10);

  if (findPort) {
    port = await findFreePort(port);
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

async function findFreePort(
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
