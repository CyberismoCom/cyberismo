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
import { serveStatic } from '@hono/node-server/serve-static';
import {
  attachCommandManager,
  attachProjectRegistry,
} from './middleware/commandManager.js';
import calculationsRouter from './domain/calculations/index.js';
import cardsRouter from './domain/cards/index.js';
import cardTypesRouter from './domain/cardTypes/index.js';
import connectorsRouter from './domain/connectors/index.js';
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
import { createAuthRouter } from './domain/auth/index.js';
import { createAuthMiddleware } from './middleware/auth.js';
import type { AuthProvider } from './auth/types.js';
import type { ProjectRegistry } from './project-registry.js';
import { createProjectsRouter } from './domain/projects/index.js';

/**
 * Create the Hono app for the backend
 * @param authProvider - Authentication provider
 * @param registry - ProjectRegistry holding all project CommandManagers
 */
export function createApp(
  authProvider: AuthProvider,
  registry: ProjectRegistry,
  opts?: TreeOptions,
) {
  const app = new Hono<{ Variables: AppVars }>();

  app.use(treeMiddleware(opts));
  // Apply authentication middleware to all API and MCP routes
  app.use('/api/*', createAuthMiddleware(authProvider));
  app.use('/mcp', createAuthMiddleware(authProvider));
  app.use('/mcp/*', createAuthMiddleware(authProvider));

  // Global routes (no project-specific CommandManager needed)
  app.route('/api/auth', createAuthRouter());
  app.route('/api/projects', createProjectsRouter(registry));

  // Project-scoped routes under /api/projects/:prefix/
  const projectScoped = new Hono<{ Variables: AppVars }>();
  projectScoped.use('*', attachProjectRegistry(registry, !!opts));
  projectScoped.route('/calculations', calculationsRouter);
  projectScoped.route('/cards', cardsRouter);
  projectScoped.route('/cardTypes', cardTypesRouter);
  projectScoped.route('/connectors', connectorsRouter);
  projectScoped.route('/fieldTypes', fieldTypesRouter);
  projectScoped.route('/graphModels', graphModelsRouter);
  projectScoped.route('/graphViews', graphViewsRouter);
  projectScoped.route('/linkTypes', linkTypesRouter);
  projectScoped.route('/reports', reportsRouter);
  projectScoped.route('/templates', templatesRouter);
  projectScoped.route('/tree', treeRouter);
  projectScoped.route('/workflows', workflowsRouter);
  projectScoped.route('/resources', resourcesRouter);
  projectScoped.route('/logicPrograms', logicProgramsRouter);
  projectScoped.route('/labels', labelsRouter);
  projectScoped.route('/project', projectRouter);

  // In export mode (opts set), mount at the concrete prefix so SSG sees
  // static routes instead of dynamic :prefix patterns it would skip.
  const exportPrefix = opts ? registry.list()[0]?.prefix : undefined;
  app.route(
    exportPrefix ? `/api/projects/${exportPrefix}` : '/api/projects/:prefix',
    projectScoped,
  );

  // MCP endpoint for AI assistant integration
  // TODO: Make MCP project-scoped when multi-project MCP is implemented
  const mcpCommands = registry.first();
  if (mcpCommands) {
    const mcpMiddleware = attachCommandManager(mcpCommands);
    app.use('/mcp', mcpMiddleware);
    app.use('/mcp/*', mcpMiddleware);
  }
  app.route('/mcp', mcpRouter);

  app.use(
    '*',
    serveStatic({
      root: staticFrontendDirRelative,
    }),
  );

  // serve index.html for all other routes
  app.notFound(async (c) => {
    if (c.req.path.startsWith('/api')) {
      return c.text('Not Found', 404);
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
