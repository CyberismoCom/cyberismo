// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Hono } from 'hono';
import * as calculationService from './service.js';
import { createCalculationSchema } from './schema.js';
import { zValidator } from '../../middleware/zvalidator.js';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';

const router = new Hono();

/**
 * @swagger
 * /api/calculations:
 *   post:
 *     summary: Create a new calculation
 *     description: Creates a new calculation with the specified identifier
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
 *         description: Calculation created successfully
 *       400:
 *         description: Invalid request body
 *       500:
 *         description: Server error
 */
router.post(
  '/',
  requireRole(UserRole.Admin, [UserRole.Connector]),
  zValidator('json', createCalculationSchema),
  async (c) => {
    const ws = c.get('ws');
    const { identifier } = c.req.valid('json');

    await calculationService.createCalculation(ws, identifier);
    return c.json({ message: 'Calculation created successfully' });
  },
);

export default router;
