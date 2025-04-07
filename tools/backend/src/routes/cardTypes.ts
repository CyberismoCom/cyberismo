/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Hono } from 'hono';

const router = new Hono();

/**
 * @swagger
 * /api/cardTypes:
 *   get:
 *     summary: Returns the full content of a specific card type.
 *     description: The key parameter is the unique identifier ("cardType") of the card type. The response includes the card type details.
 *     parameters:
 *       - name: name
 *         in: query
 *         required: true
 *         description: name of card type, including path (such as /project/cardTypes/page)
 *     responses:
 *       200:
 *        description: Object containing card type details. See definitions.ts/CardType for the structure.
 *       400:
 *         description: Error in reading project details.
 *       500:
 *         description: project_path not set or other internal error
 */
router.get('/', async (c) => {
  const commands = c.get('commands');

  // Card type name delivered in url parameter 'name' because it usually contains a path
  const cardType = c.req.query('name');
  if (!cardType) {
    return c.text('No card type', 400);
  }

  const detailsResponse = await commands.showCmd.showResource(cardType);

  if (detailsResponse) {
    return c.json(detailsResponse);
  } else {
    return c.text(`No card type details found for ${cardType}`, 500);
  }
});

export default router;
