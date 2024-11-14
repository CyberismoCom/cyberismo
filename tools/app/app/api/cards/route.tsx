/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { CommandManager } from '@cyberismocom/data-handler/command-manager';
import { ProjectMetadata } from '@cyberismocom/data-handler/interfaces/project-interfaces';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/cards:
 *   get:
 *     summary: Returns a list of all cards and their children in the defined project.
 *     description: List of cards does not include the content of the cards, only basic metadata. Use the /api/cards/{key} endpoint to get the content of a specific card.
 *     responses:
 *       200:
 *         description: Object containing the project cards. See definitions.ts/Card for the structure.
 *       400:
 *         description: Error in reading project details.
 *       500:
 *         description: project_path not set.
 */
export async function GET() {
  const projectPath = process.env.npm_config_project_path;
  if (!projectPath) {
    return new NextResponse('project_path environment variable not set.', {
      status: 500,
    });
  }

  const commands = await CommandManager.getInstance(projectPath);

  let projectResponse: ProjectMetadata;
  try {
    projectResponse = await commands.showCmd.showProject();
  } catch (error) {
    return new NextResponse(`No project found from path ${projectPath}`, {
      status: 500,
    });
  }

  const workflowsResponse = await commands.showCmd.showWorkflowsWithDetails();
  if (!workflowsResponse) {
    return new NextResponse(`No workflows found from path ${projectPath}`, {
      status: 500,
    });
  }

  const cardTypesResponse = await commands.showCmd.showCardTypesWithDetails();
  if (!cardTypesResponse) {
    return new NextResponse(`No card types found from path ${projectPath}`, {
      status: 500,
    });
  }

  const cardsResponse = await commands.showCmd.showProjectCards();
  if (cardsResponse) {
    const response = {
      name: (projectResponse! as any).name,
      cards: cardsResponse,
      workflows: workflowsResponse,
      cardTypes: cardTypesResponse,
    };
    return NextResponse.json(response);
  } else {
    return new NextResponse(`No cards found from path ${projectPath}`, {
      status: 500,
    });
  }
}
