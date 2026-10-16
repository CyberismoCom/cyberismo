// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Hono } from 'hono';
import * as workflowService from './service.js';
import { createWorkflowSchema } from './schema.js';
import { zValidator } from '../../middleware/zvalidator.js';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';

const router = new Hono();

/**
 * @swagger
 * /api/workflows:
 *   post:
 *     summary: Create a new workflow
 *     description: Creates a new workflow with the specified identifier
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
 *         description: Workflow created successfully
 *       400:
 *         description: Invalid request body
 *       500:
 *         description: Server error
 */
router.post(
  '/',
  requireRole(UserRole.Admin),
  zValidator('json', createWorkflowSchema),
  async (c) => {
    const ws = c.get('ws');
    const { identifier } = c.req.valid('json');

    await workflowService.createWorkflow(ws, identifier);
    return c.json({ message: 'Workflow created successfully' });
  },
);

export default router;
