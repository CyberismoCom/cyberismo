import { requestStatus } from '@cyberismocom/data-handler/interfaces/request-status-interfaces'
import { Show } from '@cyberismocom/data-handler/show'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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
  const projectPath = process.env.npm_config_project_path
  if (!projectPath) {
    return new NextResponse('project_path environment variable not set.', {
      status: 500,
    })
  }

  const showCommand = new Show()

  let projectResponse: requestStatus
  try {
    projectResponse = await showCommand.showProject(projectPath)
  } catch (error) {
    return new NextResponse(`No project found at path ${projectPath}`, {
      status: 500,
    })
  }

  const workflowsResponse =
    await showCommand.showWorkflowsWithDetails(projectPath)
  if (workflowsResponse.statusCode !== 200) {
    return new NextResponse(workflowsResponse.message, {
      status: workflowsResponse.statusCode,
    })
  }

  const cardTypesResponse =
    await showCommand.showCardTypesWithDetails(projectPath)
  if (cardTypesResponse.statusCode !== 200) {
    return new NextResponse(cardTypesResponse.message, {
      status: cardTypesResponse.statusCode,
    })
  }

  const cardsResponse = await showCommand.showProjectCards(projectPath)
  if (cardsResponse.statusCode == 200) {
    const response = {
      name: (projectResponse.payload! as any).name,
      cards: cardsResponse.payload,
      workflows: workflowsResponse.payload,
      cardTypes: cardTypesResponse.payload,
    }
    return NextResponse.json(response)
  } else {
    return new NextResponse(cardsResponse.message, {
      status: cardsResponse.statusCode,
    })
  }
}
