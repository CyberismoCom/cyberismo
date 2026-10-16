// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Hono } from 'hono';
import * as templateService from './service.js';
import { createTemplateSchema, addTemplateCardSchema } from './schema.js';
import { zValidator } from '../../middleware/zvalidator.js';
import { isSSGContext } from 'hono/ssg';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';

const router = new Hono();

/**
 * @swagger
 * /api/templates:
 *   get:
 *     summary: Returns a list of all templates in the defined project.
 *     description: List of templates includes only the names of the templates in the project.
 *     responses:
 *       200:
 *        description: Array containing the names of the project templates.
 *       400:
 *         description: Error in reading project details.
 *       500:
 *         description: project_path not set or other internal error
 */
router.get('/', requireRole(UserRole.Reader), async (c) => {
  // We do not need templates in ssg context
  if (isSSGContext(c)) {
    return c.json([]);
  }
  const ws = c.get('ws');

  try {
    const response = await templateService.getTemplatesWithDetails(ws);
    return c.json(response);
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
 * /api/templates:
 *   post:
 *     summary: Create a new template
 *     description: Creates a new template with the specified identifier
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
 *         description: Template created successfully
 *       400:
 *         description: Invalid request body
 *       500:
 *         description: Server error
 */
router.post(
  '/',
  requireRole(UserRole.Admin),
  zValidator('json', createTemplateSchema),
  async (c) => {
    const ws = c.get('ws');
    const { identifier } = c.req.valid('json');

    await templateService.createTemplate(ws, identifier);
    return c.json({ message: 'Template created successfully' });
  },
);

/**
 * @swagger
 * /api/templates/card:
 *   post:
 *     summary: Create a new template card
 *     description: Adds a new card to a template. New card will be created as a child of the parentKey, if parentKey value is defined.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               template:
 *                 type: string
 *               cardType:
 *                 type: string
 *               parentKey:
 *                 type: string
 *               count:
 *                 type: number
 *                 description: Number of cards to create
 *             required:
 *               - template
 *               - cardType
 *     responses:
 *       200:
 *         description: Template card(s) created successfully
 *       400:
 *         description: Invalid request body
 *       500:
 *         description: Server error
 */
router.post(
  '/card',
  requireRole(UserRole.Admin),
  zValidator('json', addTemplateCardSchema),
  async (c) => {
    const ws = c.get('ws');
    const { template, cardType, parentKey, count } = c.req.valid('json');

    const added = await templateService.addTemplateCard(
      ws,
      template,
      cardType,
      parentKey,
      count,
    );
    return c.json({ cards: added });
  },
);

export default router;
