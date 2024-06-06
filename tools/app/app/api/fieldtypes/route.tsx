import { NextResponse } from 'next/server'
import { Show } from '@cyberismocom/data-handler/show'

export const dynamic = 'force-dynamic'

/**
 * @swagger
 * /api/fieldtypes:
 *   get:
 *     summary: Returns a list of all field types in the defined project.
 *     description: List of field types includes all field types in the project with all their details
 *     responses:
 *       200:
 *        description: Object containing the project field types. See definitions.ts/FieldTypes for the structure.
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

  const response = await show.showFieldTypes(projectPath)

  if (response.statusCode === 200) {
    const fieldTypes = await Promise.all(
      (response.payload as any).map((fieldType: string) =>
        show.showFieldType(projectPath, fieldType)
      )
    )

    return NextResponse.json(
      fieldTypes.map((fieldType: any) => fieldType.payload)
    )
  } else {
    return new NextResponse(response.message, {
      status: response.statusCode,
    })
  }
}
