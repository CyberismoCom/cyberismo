// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
    const ws = c.get('ws');
    const { identifier } = c.req.valid('json');

    await graphModelService.createGraphModel(ws, identifier);
    return c.json({ message: 'Graph model created successfully' });
  },
);

export default router;
