// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Hono } from 'hono';
import * as graphViewService from './service.js';
import { createGraphViewSchema } from './schema.js';
import { zValidator } from '../../middleware/zvalidator.js';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';

const router = new Hono();

/**
 * @swagger
 * /api/graphViews:
 *   post:
 *     summary: Create a new graph view
 *     description: Creates a new graph view with the specified identifier
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
 *         description: Graph view created successfully
 *       400:
 *         description: Invalid request body
 *       500:
 *         description: Server error
 */
router.post(
  '/',
  requireRole(UserRole.Admin),
  zValidator('json', createGraphViewSchema),
  async (c) => {
    const ws = c.get('ws');
    const { identifier } = c.req.valid('json');
    await graphViewService.createGraphView(ws, identifier);
    return c.json({ message: 'Graph view created successfully' });
  },
);

export default router;
