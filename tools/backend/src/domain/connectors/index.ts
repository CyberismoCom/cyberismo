// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Hono } from 'hono';
import { isSSGContext } from 'hono/ssg';
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
  if (isSSGContext(c)) {
    return c.json([]);
  }
  const ws = c.get('ws');
  const connectors = await connectorsService.getConnectors(ws);
  return c.json(connectors);
});

export default router;
