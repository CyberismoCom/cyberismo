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
import * as labelsService from './service.js';

const router = new Hono();

/**
 * @swagger
 * /api/labels:
 *   get:
 *     summary: Returns all unique labels defined in the project.
 *     responses:
 *       200:
 *        description: List of label strings.
 *       500:
 *         description: Internal server error
 */
router.get('/', async (c) => {
  const commands = c.get('commands');
  const labels = await labelsService.getLabels(commands);
  return c.json(labels);
});

export default router;
