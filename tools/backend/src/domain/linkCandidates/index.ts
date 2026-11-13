// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Hono } from 'hono';
import { linkCandidatesSchema } from './schema.js';
import { zValidator } from '../../middleware/zvalidator.js';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';

const router = new Hono();

/**
 * @swagger
 * /api/linkCandidates:
 *   post:
 *     summary: Run a logic program and list the items it returns as link candidates
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *             required:
 *               - query
 *     responses:
 *       200:
 *         description: Candidates in query order
 *       400:
 *         description: Invalid request body, or the query language rejected the query
 *       500:
 *         description: The logic program failed
 */
router.post(
  '/',
  requireRole(UserRole.Editor),
  zValidator('json', linkCandidatesSchema),
  async (c) => {
    const ws = c.get('ws');
    const { query } = c.req.valid('json');
    const candidates = await ws.queries.linkCandidates(query);
    return c.json({ candidates });
  },
);

export default router;
