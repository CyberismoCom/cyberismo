import { Show } from '@cyberismocom/data-handler/show'
import { Transition } from '@cyberismocom/data-handler/transition'
import { Calculate } from '@cyberismocom/data-handler/calculate'
import { Edit } from '@cyberismocom/data-handler/edit'
import { NextRequest, NextResponse } from 'next/server'
import {
  fetchCardDetails,
  metadataContent,
} from '@cyberismocom/data-handler/interfaces/project-interfaces'

export const dynamic = 'force-dynamic'

/**
 * @swagger
 * /api/cards/{key}:
 *   get:
 *     summary: Returns the full content of a specific card.
 *     description: The key parameter is the unique identifier ("cardKey") of the card. The response includes the metadata and the content of the card.
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *       - name: contentType
 *         in: query
 *         required: false
 *         description: Content type of the card. Must be adoc or html. Defaults to adoc if not included.
 *     responses:
 *       200:
 *         description: Object containing card details. See definitions.ts/CardDetails for the structure.
 *       400:
 *        description: No search key or card not found with given key, or invalid contentType.
 *       500:
 *         description: project_path not set.
 *   put:
 *     summary: Make changes to a card
 *     description: The key parameter is the unique identifier ("cardKey") of the card.
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *       - name: contentType
 *         in: query
 *         required: false
 *         description: Content type of the card. Must be adoc or html. Defaults to adoc if not included.
 *       - name: content
 *         in: body
 *         required: false
 *         description: New asciidoc content for the card. Must be a string.
 *       - name: metadata
 *         in: body
 *         type: object
 *         required: false
 *         description: New metadata for the card. Must be an object with key-value pairs.
 *     responses:
 *       200:
 *         description: Object containing card details, same as GET. See definitions.ts/CardDetails for the structure.
 *       207:
 *         description: Partial success. some updates failed, some succeeded. Returns card object with successful updates.
 *       400:
 *         description: Error. Card not found, all updates failed etc. Error message in response body.
 *       500:
 *         description: project_path not set.
 */
export async function GET(request: NextRequest) {
  const projectPath = process.env.npm_config_project_path
  if (!projectPath) {
    return new NextResponse('project_path not set', { status: 500 })
  }

  // Last URL segment is the search parameter
  const key = request.nextUrl.pathname.split('/')?.pop()
  if (key == null) {
    return new NextResponse('No search key', { status: 400 })
  }

  // contentType defaults to adoc if not set
  const contentType = request.nextUrl.searchParams.get('contentType') ?? 'adoc'

  return await getCardDetails(projectPath, key, contentType)
}

export async function PUT(request: NextRequest) {
  const projectPath = process.env.npm_config_project_path
  if (!projectPath) {
    return new NextResponse('project_path not set', { status: 500 })
  }

  // Last URL segment is the search parameter
  const key = request.nextUrl.pathname.split('/')?.pop()
  if (key == null) {
    return new NextResponse('No search key', { status: 400 })
  }

  const res = await request.json()

  let successes = 0
  const errors = []

  if (res.state) {
    const calculateCommand = new Calculate()
    const transitionCommand = new Transition(calculateCommand)
    const cardTransitionResponse = await transitionCommand.cardTransition(
      projectPath,
      key,
      res.state
    )
    if (cardTransitionResponse.statusCode !== 200) {
      errors.push(cardTransitionResponse.message)
    } else {
      successes++
    }
  }

  if (res.content) {
    const editCommand = new Edit()
    const editResponse = await editCommand.editCardContent(
      projectPath,
      key,
      res.content
    )
    if (editResponse.statusCode !== 200) {
      errors.push(editResponse.message)
    } else {
      successes++
    }
  }

  if (res.metadata) {
    const editCommand = new Edit()

    for (const [metadataKey, metadataValue] of Object.entries(res.metadata)) {
      const value = metadataValue as metadataContent
      if (value === null) continue

      const editResponse = await editCommand.editCardMetadata(
        projectPath,
        key,
        metadataKey,
        value
      )
      if (editResponse.statusCode !== 200) {
        errors.push(editResponse.message)
      } else {
        successes++
      }
    }
  }

  // TODO add other update options here

  // contentType defaults to adoc if not set
  const contentType = request.nextUrl.searchParams.get('contentType') ?? 'adoc'

  if (errors.length > 0 && successes == 0) {
    // All updates failed
    return new NextResponse(errors.join('\n'), { status: 400 })
  }

  const details = await getCardDetails(projectPath, key, contentType)

  if (errors.length > 0) {
    // Some of the updates failed
    if (details.status == 200) {
      return new NextResponse(details.body, {
        status: 207,
        statusText: errors.join('\n'),
      })
    } else {
      return details
    }
  }

  return details
}

async function getCardDetails(
  projectPath: string,
  key: string,
  contentType: string
): Promise<NextResponse> {
  if (contentType !== 'adoc' && contentType !== 'html') {
    return new NextResponse('contentType must be adoc or html', { status: 400 })
  }

  const fetchCardDetails: fetchCardDetails = {
    attachments: true,
    children: false,
    content: true,
    contentType: contentType,
    metadata: true,
    parent: false,
  }

  const showCommand = new Show()
  const cardDetailsResponse = await showCommand.showCardDetails(
    projectPath,
    fetchCardDetails,
    key
  )
  if (cardDetailsResponse.statusCode == 200) {
    return NextResponse.json(cardDetailsResponse.payload)
  } else {
    return new NextResponse(cardDetailsResponse.message, {
      status: cardDetailsResponse.statusCode,
    })
  }
}
