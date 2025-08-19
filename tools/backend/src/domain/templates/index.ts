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
import { isSSGContext } from '../../export.js';
import * as templateService from './service.js';
import { createTemplateSchema } from './schema.js';
import { zValidator } from '../../middleware/zvalidator.js';

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
  // We do not need templates in ssg context
  if (isSSGContext(c)) {
    return c.json([]);
  }
  const commands = c.get('commands');

  try {
    const response = await templateService.getTemplatesWithDetails(commands);
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

/**
 * @swagger
 * /api/templates:
 *   post:
 *     summary: Create a new template
 *     description: Creates a new template with the specified identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               identifier:
 *                 type: string
 *             required:
 *               - identifier
 *     responses:
 *       200:
 *         description: Template created successfully
 *       400:
 *         description: Invalid request body
 *       500:
 *         description: Server error
 */
router.post('/', zValidator('json', createTemplateSchema), async (c) => {
  const commands = c.get('commands');
  const { identifier } = c.req.valid('json');

  await templateService.createTemplate(commands, identifier);
  return c.json({ message: 'Template created successfully' });
});

export default router;
