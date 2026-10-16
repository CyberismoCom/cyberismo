// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Hono } from 'hono';
import * as labelsService from './service.js';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';

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

router.get('/', requireRole(UserRole.Reader), async (c) => {
  const ws = c.get('ws');
  const labels = await labelsService.getLabels(ws);
  return c.json(labels);
});

export default router;
