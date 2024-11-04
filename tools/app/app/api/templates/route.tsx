/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { NextResponse } from 'next/server';
import { CommandManager } from '@cyberismocom/data-handler/command-manager';

export const dynamic = 'force-dynamic';

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
export async function GET() {
  const projectPath = process.env.npm_config_project_path;
  if (!projectPath) {
    return new NextResponse('project_path environment variable not set.', {
      status: 500,
    });
  }
  const commands = CommandManager.getInstance(projectPath);

  try {
    commands.showCmd.showProject();
  } catch (error) {
    return new NextResponse(`No project found at path ${projectPath}`, {
      status: 500,
    });
  }

  const response = await commands.showCmd.showTemplatesWithDetails();
  if (response) {
    return NextResponse.json(response);
  } else {
    return new NextResponse(`No templates found from path ${projectPath}`, {
      status: 500,
    });
  }
}
