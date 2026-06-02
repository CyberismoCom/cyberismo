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
import { Hono, type MiddlewareHandler } from 'hono';
import { staticFrontendDirRelative } from './utils.js';
import { serveStatic } from '@hono/node-server/serve-static';
import { attachProjectRegistry } from './middleware/commandManager.js';
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
import * as fs from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path, { join } from 'node:path';
import resourcesRouter from './domain/resources/index.js';
import logicProgramsRouter from './domain/logicPrograms/index.js';
import { isSSGContext } from 'hono/ssg';
import type { AppVars, TreeOptions } from './types.js';
import treeMiddleware from './middleware/tree.js';
import projectRouter from './domain/project/index.js';
import { createMcpRouter } from './domain/mcp/index.js';
import { createAuthRouter } from './domain/auth/index.js';
import { createAuthMiddleware } from './middleware/auth.js';
import type { AuthProvider } from './auth/types.js';
import { MockAuthProvider, mockRoleCookieMiddleware } from './auth/mock.js';
import type { ProjectRegistry } from './project-registry.js';
import { CommandManager, scanForProjects } from '@cyberismo/data-handler';
import { createProjectsRouter } from './domain/projects/index.js';
import { simpleMcpAuthRouter } from '@hono/mcp';

/**
 * Create a Hono sub-app with all project-scoped routes.
 */
function createProjectScopedRoutes(
  middleware: MiddlewareHandler,
): Hono<{ Variables: AppVars }> {
  const projectScoped = new Hono<{ Variables: AppVars }>();
  projectScoped.use('*', middleware);
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
  return projectScoped;
}

/**
 * Create the Hono app for the backend
 * @param authProvider - Authentication provider
 * @param registry - ProjectRegistry holding all project CommandManagers
 */
export function createApp(
  authProvider: AuthProvider,
  registry: ProjectRegistry,
  opts?: TreeOptions,
  exportMode = false,
  rootPath?: string,
) {
  const app = new Hono<{ Variables: AppVars }>();

  // Public — no auth middleware (MCP clients call this before they have a token)
  // RFC 9728 resource metadata & OAuth authorization server metadata via @hono/mcp
  const issuer = process.env.OIDC_ISSUER;
  if (issuer) {
    const origin = new URL(issuer).origin;
    app.route(
      '/',
      simpleMcpAuthRouter({
        issuer,
        resourceServerUrl: new URL(`${origin}/mcp`),
      }),
    );
  }

  app.use(treeMiddleware(opts));

  // Public app configuration
  app.get('/api/config', (c) => {
    return c.json({
      staticMode: exportMode,
      logoutUrl: process.env.APP_LOGOUT_URL || '',
      presenceEnabled: process.env.APP_PRESENCE_ENABLED === 'true',
      defaultProject: process.env.CYBERISMO_DEFAULT_PROJECT || undefined,
    });
  });

  // Dev-only: let `?role=<reader|editor|admin>` set a persistent mock-role cookie
  // so role gating can be exercised locally without code changes or a restart.
  if (authProvider instanceof MockAuthProvider) {
    app.use(mockRoleCookieMiddleware());
  }

  // Apply authentication middleware to all API and MCP routes
  app.use('/api/*', createAuthMiddleware(authProvider));
  app.use('/mcp', createAuthMiddleware(authProvider));
  app.use('/mcp/*', createAuthMiddleware(authProvider));

  // Global routes (no project-specific CommandManager needed)
  app.route('/api/auth', createAuthRouter());
  app.route('/api/projects', createProjectsRouter(registry, rootPath));

  // Test-mode reset endpoint: wipes the project dir, restores it from the
  // golden snapshot, and rebuilds the registry in place. Used by the
  // Playwright e2e harness to restore the project between spec files.
  // Gated by NODE_ENV so it never ships in production.
  if (process.env.NODE_ENV === 'test') {
    app.post('/api/test/reset', async (c) => {
      const projectPath = process.env.npm_config_project_path;
      const goldenPath = process.env.CYBERISMO_GOLDEN_PATH;
      if (!projectPath || !goldenPath) {
        return c.json(
          {
            error:
              'npm_config_project_path and CYBERISMO_GOLDEN_PATH are required for /api/test/reset',
          },
          500,
        );
      }
      // Defense-in-depth: refuse to operate on suspicious paths. NODE_ENV gates
      // route registration, but a misconfigured CI shouldn't be one typo away
      // from wiping a developer's $HOME.
      const resolvedProject = path.resolve(projectPath);
      if (
        path.dirname(resolvedProject) === resolvedProject ||
        resolvedProject === os.homedir()
      ) {
        return c.json(
          {
            error: `Refusing to reset suspicious project path: ${resolvedProject}`,
          },
          400,
        );
      }
      await fs.rm(resolvedProject, { recursive: true, force: true });
      await fs.cp(goldenPath, resolvedProject, { recursive: true });
      const autocommit = process.env.CYBERISMO_AUTOCOMMIT === 'true';
      const projects = await scanForProjects(resolvedProject);

      if (projects.length === 0) {
        return c.json(
          {
            error: `reset scan found no projects at ${resolvedProject}`,
          },
          500,
        );
      }
      const entries = [];
      for (const project of projects) {
        const commands = new CommandManager(project.path, { autocommit });
        await commands.initialize();
        entries.push({ prefix: project.prefix, commands });
      }
      await registry.replace(entries);
      return c.body(null, 204);
    });
  }
  // Tenant-level SSH public key
  app.get('/api/public-key', async (c) => {
    if (!rootPath) return c.json({ publicKey: null });
    try {
      const content = await readFile(
        join(rootPath, '.git-push', 'id_rsa.pub'),
        'utf-8',
      );
      return c.json({ publicKey: content.trim() });
    } catch {
      return c.json({ publicKey: null });
    }
  });

  if (exportMode) {
    // Export mode: mount at each concrete prefix so SSG sees
    // static routes instead of dynamic :prefix patterns it would skip.
    for (const { prefix } of registry.list()) {
      const scoped = createProjectScopedRoutes(
        attachProjectRegistry(registry, prefix),
      );
      app.route(`/api/projects/${prefix}`, scoped);
    }
  } else {
    // Normal mode: dynamic :prefix param
    const scoped = createProjectScopedRoutes(attachProjectRegistry(registry));
    app.route('/api/projects/:prefix', scoped);
  }

  // MCP endpoint for AI assistant integration
  app.route('/mcp', createMcpRouter(registry));

  app.use(
    '*',
    serveStatic({
      root: staticFrontendDirRelative,
    }),
  );

  // serve index.html for all other routes
  app.notFound(async (c) => {
    if (
      c.req.path.startsWith('/api') ||
      c.req.path.startsWith('/.well-known')
    ) {
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
