/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
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
import * as connectorsService from './service.js';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';

const router = new Hono();

/**
 * @openapi
 * /api/connectors:
 *   get:
 *     summary: Returns all available connectors
 *     responses:
 *       200:
 *         description: List of connectors with their display names
 */
router.get('/', requireRole(UserRole.Reader), async (c) => {
  const commands = c.get('commands');
  const connectors = await connectorsService.getConnectors(commands);
  return c.json(connectors);
});

export default router;
