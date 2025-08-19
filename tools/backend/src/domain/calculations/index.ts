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
import * as calculationService from './service.js';
import { createCalculationSchema } from './schema.js';
import { zValidator } from '../../middleware/zvalidator.js';

const router = new Hono();

/**
 * @swagger
 * /api/calculations:
 *   post:
 *     summary: Create a new calculation
 *     description: Creates a new calculation file with the specified fileName
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fileName:
 *                 type: string
 *             required:
 *               - fileName
 *     responses:
 *       200:
 *         description: Calculation created successfully
 *       400:
 *         description: Invalid request body
 *       500:
 *         description: Server error
 */
router.post('/', zValidator('json', createCalculationSchema), async (c) => {
  const commands = c.get('commands');
  const { fileName } = c.req.valid('json');

  await calculationService.createCalculation(commands, fileName);
  return c.json({ message: 'Calculation created successfully' });
});

export default router;
