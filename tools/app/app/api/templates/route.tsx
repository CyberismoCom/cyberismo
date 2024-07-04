import { NextResponse } from 'next/server'
import { Show } from '@cyberismocom/data-handler/show'

export const dynamic = 'force-dynamic'

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
  const projectPath = process.env.npm_config_project_path
  const show = new Show()
  if (!projectPath) {
    return new NextResponse('project_path environment variable not set.', {
      status: 500,
    })
  }

  try {
    show.showProject(projectPath)
  } catch (error) {
    return new NextResponse(`No project found at path ${projectPath}`, {
      status: 500,
    })
  }

  const response = await show.showTemplatesWithDetails(projectPath)
  if (response) {
    return NextResponse.json(response)
  } else {
    return new NextResponse(`No templates found from path ${projectPath}`, {
      status: 500,
    })
  }
}
