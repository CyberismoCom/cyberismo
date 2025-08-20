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
import * as fieldTypeService from './service.js';
import { createFieldTypeSchema } from './schema.js';
import { zValidator } from '../../middleware/zvalidator.js';

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

  try {
    const fieldTypes = await fieldTypeService.getFieldTypes(commands);
    return c.json(fieldTypes);
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
 * /api/fieldTypes:
 *   post:
 *     summary: Create a new field type
 *     description: Creates a new field type with the specified data type
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fieldTypeName:
 *                 type: string
 *               dataType:
 *                 type: string
 *                 enum: [boolean, date, dateTime, enum, integer, list, longText, number, person, shortText]
 *             required:
 *               - fieldTypeName
 *               - dataType
 *     responses:
 *       200:
 *         description: Field type created successfully
 *       400:
 *         description: Invalid request body
 *       500:
 *         description: Server error
 */
router.post('/', zValidator('json', createFieldTypeSchema), async (c) => {
  const commands = c.get('commands');
  const { identifier, dataType } = c.req.valid('json');

  try {
    await fieldTypeService.createFieldType(commands, identifier, dataType);
    return c.json({ message: 'Field type created successfully' });
  } catch (error) {
    return c.json(
      {
        error: `${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      500,
    );
  }
});

export default router;
