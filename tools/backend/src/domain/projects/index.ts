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
import type { ProjectRegistry } from '../../project-registry.js';
import { requireRole } from '../../middleware/auth.js';
import { UserRole } from '../../types.js';

export function createProjectsRouter(registry: ProjectRegistry) {
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
    return c.json(registry.list());
  });

  return router;
}
