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
import * as resourceService from './service.js';

const router = new Hono();

/**
 * @swagger
 * /api/resources/tree:
 *   get:
 *     summary: Returns a complete tree structure of all project resources
 *     description: Returns a hierarchical tree of all resources including their full data from showResource calls
 *     responses:
 *       200:
 *        description: Tree structure containing all resources with their complete data
 *       500:
 *         description: project_path not set or other internal error
 */
router.get('/tree', async (c) => {
  const commands = c.get('commands');

  try {
    const tree = await resourceService.buildResourceTree(commands);
    return c.json(tree);
  } catch (error) {
    return c.json(
      {
        error: `Failed to build resource tree: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      500,
    );
  }
});

export default router;
