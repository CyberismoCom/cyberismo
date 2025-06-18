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
import { ssgParams } from '../export.js';

const router = new Hono();

/**
 * @swagger
 * /api/resources/{resourceType}:
 *   get:
 *     summary: Returns a list of all resources of a given type in the defined project.
 *     description: Returns a list of all resources of a given type in the defined project.
 *     responses:
 *       200:
 *        description: Array of strings, each representing a the name of a resource of a given type.
 *       500:
 *         description: project_path not set or other internal error
 */
router.get(
  '/:resourceType',
  ssgParams(async () => [
    {
      resourceType: 'calculations',
    },
    {
      resourceType: 'cardTypes',
    },
    {
      resourceType: 'fieldTypes',
    },
    {
      resourceType: 'graphModels',
    },
    {
      resourceType: 'graphViews',
    },
    {
      resourceType: 'linkTypes',
    },
    {
      resourceType: 'reports',
    },
    {
      resourceType: 'templates',
    },
    {
      resourceType: 'workflows',
    },
  ]),
  async (c) => {
    const commands = c.get('commands');

    const response = await commands.showCmd.showResources(
      c.req.param('resourceType'),
    );
    if (response) {
      return c.json(response);
    } else {
      return c.json(
        {
          error: `No field types found from path ${c.get('projectPath')}`,
        },
        500,
      );
    }
  },
);

export default router;
