/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Hono } from 'hono';

const router = new Hono();

/**
 * @swagger
 * /api/tree
 *   get:
 *     summary: Returns everything required by treeview
 *     description: Returns the query result
 *     responses:
 *       200:
 *        description: Object containing the query result
 *       500:
 *         description: project_path not set or other internal error
 */
router.get('/', async (c) => {
  const commands = c.get('commands');
  try {
    await commands.calculateCmd.generate();
    const tree = await commands.calculateCmd.runQuery('tree');
    return c.json(tree);
  } catch (e) {
    return c.text((e instanceof Error && e.message) || '', 500);
  }
});

export default router;
