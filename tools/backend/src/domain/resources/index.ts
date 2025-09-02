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
import * as resourceService from './service.js';
import type {
  ResourceFileContentResponse,
  ResourceValidationResponse,
} from '../../types.js';
import { resourceParamsSchema } from '../../common/validationSchemas.js';
import { zValidator } from '../../middleware/zvalidator.js';
import { validateResourceParamsSchema } from './schema.js';

const router = new Hono();

/**
 * @swagger
 * /api/resources/tree:
 *   get:
 *     summary: Returns a complete tree structure of all project resources
 *     description: Returns a hierarchical tree of all resources including their full data from showResource calls
 *     responses:
 *       200:
 *        description: Tree structure containing all resources with their complete data
 *       500:
 *         description: project_path not set or other internal error
 */
router.get('/tree', async (c) => {
  const commands = c.get('commands');

  try {
    const tree = await resourceService.buildResourceTree(commands);
    return c.json(tree);
  } catch (error) {
    return c.json(
      {
        error: `Failed to build resource tree: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      500,
    );
  }
});

/**
 * @swagger
 * /api/resources/{prefix}/{type}/{identifier}/validate:
 *   get:
 *     summary: Validates a single resource
 *     description: Returns validation errors for a specific resource
 *     parameters:
 *       - in: path
 *         name: prefix
 *         required: true
 *         schema:
 *           type: string
 *         description: Prefix of the resource
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *         description: Resource type (e.g., 'cardTypes', 'fieldTypes')
 *       - in: path
 *         name: identifier
 *         required: true
 *         schema:
 *           type: string
 *         description: Identifier of the resource
 *     responses:
 *       200:
 *         description: Validation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 errors:
 *                   type: array
 *                   description: Validation errors (empty array if valid)
 *                   items:
 *                     type: string
 *                     description: Validation error message
 *       404:
 *         description: Resource not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/:prefix/:type/:identifier/validate',
  zValidator('param', validateResourceParamsSchema),
  async (c) => {
    const commands = c.get('commands');
    const resourceParams = c.req.valid('param');

    try {
      const response: ResourceValidationResponse =
        await resourceService.validateResource(commands, resourceParams);
      return c.json(response);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return c.json({ error: error.message }, 404);
      }
      throw error;
    }
  },
);

router.get('/:module/:type/:resource/:file', async (c) => {
  const commands = c.get('commands');
  const { module, type, resource, file } = c.req.param();
  const content = await resourceService.getFileContent(
    commands,
    module,
    type,
    resource,
    file,
  );
  const response: ResourceFileContentResponse = { content };
  return c.json(response);
});

router.put('/:module/:type/:resource/:file', async (c) => {
  const commands = c.get('commands');
  const { module, type, resource, file } = c.req.param();
  const changedContent = await c.req.json();
  if (
    changedContent.content === undefined ||
    typeof changedContent.content !== 'string'
  ) {
    return c.json({ error: 'Content is required' }, 400);
  }
  await resourceService.updateFile(
    commands,
    module,
    type,
    resource,
    file,
    changedContent.content,
  );
  return c.json({ content: changedContent.content });
});

router.delete(
  '/:prefix/:type/:identifier',
  zValidator('param', resourceParamsSchema),
  async (c) => {
    const commands = c.get('commands');
    const resourceParams = c.req.valid('param');
    await resourceService.deleteResource(commands, resourceParams);
    return c.json({
      message: 'Resource deleted',
    });
  },
);

export default router;
