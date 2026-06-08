/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
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
import { zValidator } from '../../middleware/zvalidator.js';
import type { ProjectRegistry } from '../../project-registry.js';
import { requireRole, getCurrentUser } from '../../middleware/auth.js';
import { UserRole } from '../../types.js';
import { createProjectSchema, cloneProjectSchema } from './schema.js';
import * as projectsService from './service.js';

export function createProjectsRouter(
  registry: ProjectRegistry,
  multiProjectRoot?: string,
) {
  const router = new Hono();

  /**
   * @swagger
   * /api/projects:
   *   get:
   *     summary: List available projects
   *     description: Returns a list of all available projects
   *     responses:
   *       200:
   *         description: List of projects
   *       401:
   *         description: Unauthorized
   */
  router.get('/', requireRole(UserRole.Reader), (c) => {
    return c.json({
      projects: registry.list(),
      canCreateProjects: !!multiProjectRoot,
    });
  });

  /**
   * @swagger
   * /api/projects:
   *   post:
   *     summary: Create a new project
   *     description: Creates a new project on disk, initializes git, adds default hub
   */
  router.post(
    '/',
    requireRole(UserRole.Editor),
    zValidator('json', createProjectSchema),
    async (c) => {
      if (!multiProjectRoot) {
        return c.json(
          { error: 'Project creation is not available in single-project mode' },
          403,
        );
      }

      const params = c.req.valid('json');

      if (registry.has(params.prefix)) {
        return c.json(
          { error: `Project with prefix '${params.prefix}' already exists` },
          409,
        );
      }

      try {
        const result = await projectsService.createProject(
          registry,
          multiProjectRoot,
          params,
          getCurrentUser(c),
        );
        return c.json(result, 201);
      } catch (error) {
        return c.json(
          {
            error:
              error instanceof Error
                ? error.message
                : 'Failed to create project',
          },
          500,
        );
      }
    },
  );

  /**
   * @swagger
   * /api/projects/clone:
   *   post:
   *     summary: Clone a project from a git repository
   *     description: Clones a git repo and registers discovered projects
   */
  router.post(
    '/clone',
    requireRole(UserRole.Editor),
    zValidator('json', cloneProjectSchema),
    async (c) => {
      if (!multiProjectRoot) {
        return c.json(
          { error: 'Project cloning is not available in single-project mode' },
          403,
        );
      }

      const { url } = c.req.valid('json');

      try {
        const result = await projectsService.cloneProject(
          registry,
          multiProjectRoot,
          url,
        );

        if (result.projects.length === 0) {
          return c.json(
            {
              error: 'All projects in the cloned repository already exist',
              skippedDuplicates: result.skippedDuplicates,
            },
            409,
          );
        }

        return c.json(result, 201);
      } catch (error) {
        return c.json(
          {
            error:
              error instanceof Error
                ? error.message
                : 'Failed to clone repository',
          },
          500,
        );
      }
    },
  );

  return router;
}
