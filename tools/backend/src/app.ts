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
import { Hono } from 'hono';
import { staticFrontendDirRelative } from './utils.js';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { attachCommandManager } from './middleware/commandManager.js';
import cardsRouter from './routes/cards.js';
import fieldTypesRouter from './routes/fieldTypes.js';
import linkTypesRouter from './routes/linkTypes.js';
import templatesRouter from './routes/templates.js';
import treeRouter from './routes/tree.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isSSGContext } from './export.js';
import resourcesRouter from './routes/resources.js';

/**
 * Create the Hono app for the backend
 * @param projectPath - Path to the project
 */
export function createApp(projectPath?: string) {
  const app = new Hono();

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
  app.route('/api/resources', resourcesRouter);

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
    if (!isSSGContext(c)) {
      console.error(err.stack);
    }
    return c.json(
      {
        error: isSSGContext(c)
          ? err.message || 'Internal Server Error'
          : 'Internal Server Error',
      },
      500,
    );
  });

  return app;
}
