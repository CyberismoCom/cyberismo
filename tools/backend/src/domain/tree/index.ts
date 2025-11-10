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
import * as treeService from './service.js';
import { isSSGContext } from 'hono/ssg';

const router = new Hono();

/**
 * @swagger
 * /api/tree:
 *   get:
 *     summary: Returns a card tree of all cards in the defined project.
 *     description: List of cards displayed in hierarchical format as a tree
 *     responses:
 *       200:
 *        description: Object containing the project cards in tree format. See definitions.ts/Card for the structure.
 *       400:
 *         description: Error in reading project details.
 *       500:
 *         description: project_path not set or other internal error
 */
router.get('/', async (c) => {
  const commands = c.get('commands');

  try {
    const response = await treeService.getCardTree(commands, isSSGContext(c));
    return c.json(response);
  } catch (error) {
    return c.json(
      {
        error: `${error instanceof Error ? error.message : 'Unknown error'} from path ${c.get('projectPath')}`,
      },
      500,
    );
  }
});

export default router;
