// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Hono } from 'hono';
import * as treeService from './service.js';
import { isSSGContext } from 'hono/ssg';
import type { AppContext } from '../../types.js';
import { UserRole } from '../../types.js';
import { requireRole } from '../../middleware/auth.js';

const router = new Hono();

/**
 * @swagger
 * /api/tree:
 *   get:
 *     summary: Returns a card tree of all cards in the defined project.
 *     description: List of cards displayed in hierarchical format as a tree
 *     responses:
 *       200:
 *        description: Object containing the project cards in tree format. See definitions.ts/Card for the structure.
 *       400:
 *         description: Error in reading project details.
 *       500:
 *         description: project_path not set or other internal error
 */
router.get('/', requireRole(UserRole.Reader), async (c: AppContext) => {
  const ws = c.get('ws');
  const tree = c.get('tree');

  try {
    const response = await treeService.getCardTree(
      ws,
      isSSGContext(c),
      tree?.cardKey,
      tree?.recursive,
    );
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

export default router;
