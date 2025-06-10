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
 * /api/fieldTypes:
 *   get:
 *     summary: Returns a list of all field types in the defined project.
 *     description: List of field types includes all field types in the project with all their details
 *     responses:
 *       200:
 *        description: Object containing the project field types. See definitions.ts/FieldTypes for the structure.
 *       400:
 *         description: Error in reading project details.
 *       500:
 *         description: project_path not set or other internal error
 */
router.get('/', async (c) => {
  const commands = c.get('commands');

  const response = await commands.showCmd.showResources('fieldTypes');
  if (response) {
    const fieldTypes = await Promise.all(
      response.map((fieldType: string) =>
        commands.showCmd.showResource(fieldType),
      ),
    );

    return c.json(fieldTypes);
  } else {
    return c.json(
      {
        error: `No field types found from path ${c.get('projectPath')}`,
      },
      500,
    );
  }
});

export default router;
