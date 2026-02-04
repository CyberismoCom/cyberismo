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
import calculationsRouter from './domain/calculations/index.js';
import cardsRouter from './domain/cards/index.js';
import cardTypesRouter from './domain/cardTypes/index.js';
import fieldTypesRouter from './domain/fieldTypes/index.js';
import graphModelsRouter from './domain/graphModels/index.js';
import graphViewsRouter from './domain/graphViews/index.js';
import linkTypesRouter from './domain/linkTypes/index.js';
import reportsRouter from './domain/reports/index.js';
import templatesRouter from './domain/templates/index.js';
import treeRouter from './domain/tree/index.js';
import workflowsRouter from './domain/workflows/index.js';
import labelsRouter from './domain/labels/index.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import resourcesRouter from './domain/resources/index.js';
import logicProgramsRouter from './domain/logicPrograms/index.js';
import { isSSGContext } from 'hono/ssg';
import type { AppVars, TreeOptions } from './types.js';
import treeMiddleware from './middleware/tree.js';
import projectRouter from './domain/project/index.js';
import mcpRouter from './domain/mcp/index.js';

/**
 * Create the Hono app for the backend
 * @param projectPath - Path to the project
 */
export function createApp(projectPath?: string, opts?: TreeOptions) {
  const app = new Hono<{ Variables: AppVars }>();

  app.use('/api', cors());

  app.use(
    '*',
    serveStatic({
      root: staticFrontendDirRelative,
    }),
  );

  app.use(treeMiddleware(opts));
  // Attach CommandManager to all requests
  app.use(attachCommandManager(projectPath));

  // Wire up routes
  app.route('/api/calculations', calculationsRouter);
  app.route('/api/cards', cardsRouter);
  app.route('/api/cardTypes', cardTypesRouter);
  app.route('/api/fieldTypes', fieldTypesRouter);
  app.route('/api/graphModels', graphModelsRouter);
  app.route('/api/graphViews', graphViewsRouter);
  app.route('/api/linkTypes', linkTypesRouter);
  app.route('/api/reports', reportsRouter);
  app.route('/api/templates', templatesRouter);
  app.route('/api/tree', treeRouter);
  app.route('/api/workflows', workflowsRouter);
  app.route('/api/resources', resourcesRouter);
  app.route('/api/logicPrograms', logicProgramsRouter);
  app.route('/api/labels', labelsRouter);
  app.route('/api/project', projectRouter);

  // MCP endpoint for AI assistant integration
  app.route('/mcp', mcpRouter);

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
      if (process.env.NODE_ENV !== 'test') {
        console.error(err.stack);
      }
    }
    return c.json(
      {
        error: err.message || 'Internal Server Error',
      },
      500,
    );
  });

  return app;
}
