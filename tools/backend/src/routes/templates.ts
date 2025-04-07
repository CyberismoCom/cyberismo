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
 * /api/templates:
 *   get:
 *     summary: Returns a list of all templates in the defined project.
 *     description: List of templates includes only the names of the templates in the project.
 *     responses:
 *       200:
 *        description: Array containing the names of the project templates.
 *       400:
 *         description: Error in reading project details.
 *       500:
 *         description: project_path not set or other internal error
 */
router.get('/', async (c) => {
  const commands = c.get('commands');

  const response = await commands.showCmd.showTemplatesWithDetails();
  if (response) {
    return c.json(response);
  } else {
    return c.text(`No templates found from path ${c.get('projectPath')}`, 500);
  }
});

export default router;
