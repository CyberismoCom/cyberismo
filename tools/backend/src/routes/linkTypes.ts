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
 * /api/linkTypes:
 *   get:
 *     summary: Returns a list of all link types in the defined project.
 *     description: List of link types includes all link types in the project with all their details
 *     responses:
 *       200:
 *        description: Object containing the project link types.
 *       400:
 *         description: Error in reading project details.
 *       500:
 *         description: project_path not set or other internal error
 */
router.get('/', async (c) => {
  const commands = c.get('commands');

  const response = await commands.showCmd.showResources('linkTypes');
  if (response) {
    const linkTypes = await Promise.all(
      response.map((linkType: string) =>
        commands.showCmd.showResource(linkType),
      ),
    );

    return c.json(linkTypes);
  } else {
    return c.json(
      {
        error: `No link types found from path ${c.get('projectPath')}`,
      },
      500,
    );
  }
});

export default router;
