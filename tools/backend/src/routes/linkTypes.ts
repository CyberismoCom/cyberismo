/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import express, { Router } from 'express';

const router: Router = express.Router();

/**
 * @swagger
 * /api/linkTypes:
 *   get:
 *     summary: Returns a list of all link types in the defined project.
 *     description: List of link types includes all link types in the project with all their details
 *     responses:
 *       200:
 *        description: Object containing the project link types.
 *       400:
 *         description: Error in reading project details.
 *       500:
 *         description: project_path not set or other internal error
 */
router.get('/', async (req, res) => {
  const commands = req.commands;

  try {
    commands.showCmd.showProject();
  } catch (error) {
    return res
      .status(500)
      .send(`No project found at path ${process.env.npm_config_project_path}`);
  }

  const response = await commands.showCmd.showResources('linkTypes');
  if (response) {
    const linkTypes = await Promise.all(
      response.map((linkType: string) =>
        commands.showCmd.showResource(linkType),
      ),
    );

    return res.json(linkTypes);
  } else {
    return res
      .status(500)
      .send(
        `No link types found from path ${process.env.npm_config_project_path}`,
      );
  }
});

export default router;
