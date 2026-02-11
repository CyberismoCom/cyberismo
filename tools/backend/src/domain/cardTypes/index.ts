/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
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
import * as cardTypeService from './service.js';
import {
  createCardTypeSchema,
  cardTypeNameParamSchema,
  fieldVisibilityBodySchema,
} from './schema.js';
import { zValidator } from '../../middleware/zvalidator.js';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';

const router = new Hono();

/**
 * @swagger
 * /api/cardTypes:
 *   get:
 *     summary: Returns a list of all card types in the defined project.
 *     description: List of card types includes all card types in the project with all their details
 *     responses:
 *       200:
 *        description: Object containing the project card types.
 *       400:
 *         description: Error in reading project details.
 *       500:
 *         description: project_path not set or other internal error
 */
router.get('/', requireRole(UserRole.Reader), async (c) => {
  const commands = c.get('commands');

  try {
    const cardTypes = await cardTypeService.getCardTypes(commands);
    return c.json(cardTypes);
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
 * /api/cardTypes:
 *   post:
 *     summary: Create a new card type
 *     description: Creates a new card type with the specified workflow
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cardTypeName:
 *                 type: string
 *               workflowName:
 *                 type: string
 *             required:
 *               - cardTypeName
 *               - workflowName
 *     responses:
 *       200:
 *         description: Card type created successfully
 *       400:
 *         description: Invalid request body
 *       500:
 *         description: Server error
 */
router.post(
  '/',
  requireRole(UserRole.Admin),
  zValidator('json', createCardTypeSchema),
  async (c) => {
    const commands = c.get('commands');
    const { identifier, workflowName } = c.req.valid('json');

    try {
      await cardTypeService.createCardType(commands, identifier, workflowName);
      return c.json({ message: 'Card type created successfully' });
    } catch (error) {
      return c.json(
        {
          error: `${error instanceof Error ? error.message : 'Unknown error'}`,
        },
        500,
      );
    }
  },
);

/**
 * @swagger
 * /api/cardTypes/{cardTypeName}/field-visibility:
 *   patch:
 *     summary: Update field visibility for a card type
 *     description: Move a field between visibility groups (always, optional, hidden) and optionally set its position
 *     parameters:
 *       - in: path
 *         name: cardTypeName
 *         required: true
 *         schema:
 *           type: string
 *         description: Full name of the card type (e.g., "prefix/cardTypes/identifier")
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fieldName:
 *                 type: string
 *                 description: Name of the field to update
 *               group:
 *                 type: string
 *                 enum: [always, optional, hidden]
 *                 description: Target visibility group
 *               index:
 *                 type: number
 *                 description: Optional position within the group
 *             required:
 *               - fieldName
 *               - group
 *     responses:
 *       200:
 *         description: Field visibility updated successfully
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Card type not found
 *       500:
 *         description: Server error
 */
router.patch(
  '/:cardTypeName/field-visibility',
  requireRole(UserRole.Admin),
  zValidator('param', cardTypeNameParamSchema),
  zValidator('json', fieldVisibilityBodySchema),
  async (c) => {
    const commands = c.get('commands');
    const { cardTypeName } = c.req.valid('param');
    const body = c.req.valid('json');

    try {
      await cardTypeService.updateFieldVisibility(commands, cardTypeName, body);
      return c.json({ message: 'Field visibility updated successfully' });
    } catch (error) {
      // TODO: Implement NotFoundError etc and handle them globally
      if (error instanceof Error && error.message.includes('does not exist')) {
        return c.json({ error: error.message }, 404);
      }
      return c.json(
        {
          error: `${error instanceof Error ? error.message : 'Unknown error'}`,
        },
        500,
      );
    }
  },
);

export default router;
