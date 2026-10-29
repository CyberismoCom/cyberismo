// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Hono } from 'hono';
import * as linkTypeService from './service.js';
import { createLinkTypeSchema } from './schema.js';
import { zValidator } from '../../middleware/zvalidator.js';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';

const router = new Hono();

/**
 * @swagger
 * /api/linkTypes:
 *   get:
 *     summary: Returns a list of all link types in the defined project.
 *     description: List of link types includes all link types in the project with all their details
 *     responses:
 *       200:
 *        description: Object containing the project link types. See definitions.ts/LinkTypes for the structure.
 *       400:
 *         description: Error in reading project details.
 *       500:
 *         description: project_path not set or other internal error
 */
router.get('/', requireRole(UserRole.Reader), async (c) => {
  const ws = c.get('ws');

  try {
    const linkTypes = await linkTypeService.getLinkTypes(ws);
    return c.json(linkTypes);
  } catch (error) {
    return c.json(
      {
        error: `${error instanceof Error ? error.message : 'Unknown error'} from path ${c.get('projectPath')}`,
      },
      500,
    );
  }
});

/**
 * @swagger
 * /api/linkTypes:
 *   post:
 *     summary: Create a new link type
 *     description: Creates a new link type with the specified identifier
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
 *         description: Link type created successfully
 *       400:
 *         description: Invalid request body
 *       500:
 *         description: Server error
 */
router.post(
  '/',
  requireRole(UserRole.Admin),
  zValidator('json', createLinkTypeSchema),
  async (c) => {
    const ws = c.get('ws');
    const { identifier } = c.req.valid('json');

    await linkTypeService.createLinkType(ws, identifier);
    return c.json({ message: 'Link type created successfully' });
  },
);

export default router;
