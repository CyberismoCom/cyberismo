import { NextRequest, NextResponse } from 'next/server'
import { attachmentPayload } from '@cyberismocom/data-handler/interfaces/request-status-interfaces'
import { Show } from '@cyberismocom/data-handler/show'

export const dynamic = 'force-dynamic'

/**
 * @swagger
 * /api/cards/{key}/a/{attachment}:
 *   get:
 *     summary: Returns an attachment file for a specific card.
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *       - name: attachment
 *         in: path
 *         required: true
 *         description: file name of the attachment
 *     responses:
 *       200:
 *         description: Attachment object as a file buffer, content-type set to the mime type of the file
 *       400:
 *         description: No search key or card not found with given key
 *       404:
 *         description: Attachment file not found
 *       500:
 *         description: project_path not set.
 */
export async function GET(request: NextRequest) {
  const projectPath = process.env.npm_config_project_path
  if (!projectPath) {
    return new NextResponse('project_path not set', { status: 500 })
  }

  const urlComponents = request.nextUrl.pathname.split('/')
  const filename = urlComponents?.pop()
  urlComponents?.pop()
  const cardKey = urlComponents?.pop()

  if (filename == null || cardKey == null) {
    return new NextResponse('Missing cardKey or filename', { status: 400 })
  }

  const showCommand = new Show()
  const attachmentResponse = await showCommand.showAttachment(
    projectPath,
    cardKey,
    filename
  )

  if (attachmentResponse.statusCode != 200) {
    return new NextResponse(attachmentResponse.message, { status: 404 })
  }

  const payload: attachmentPayload =
    attachmentResponse.payload as attachmentPayload

  return new NextResponse(payload.fileBuffer, {
    headers: { 'content-type': payload.mimeType },
  })
}
