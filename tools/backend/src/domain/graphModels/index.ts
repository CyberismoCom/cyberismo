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
import * as graphModelService from './service.js';
import { createGraphModelSchema } from './schema.js';
import { zValidator } from '../../middleware/zvalidator.js';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';

const router = new Hono();

/**
 * @swagger
 * /api/graphModels:
 *   post:
 *     summary: Create a new graph model
 *     description: Creates a new graph model with the specified identifier
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
 *         description: Graph model created successfully
 *       400:
 *         description: Invalid request body
 *       500:
 *         description: Server error
 */
router.post(
  '/',
  requireRole(UserRole.Admin),
  zValidator('json', createGraphModelSchema),
  async (c) => {
    const commands = c.get('commands');
    const { identifier } = c.req.valid('json');

    await graphModelService.createGraphModel(commands, identifier);
    return c.json({ message: 'Graph model created successfully' });
  },
);

export default router;
