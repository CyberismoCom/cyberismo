/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { NextRequest, NextResponse } from 'next/server';
import { attachmentPayload } from '@cyberismocom/data-handler/interfaces/request-status-interfaces';
import { CommandManager } from '@cyberismocom/data-handler/command-manager';

export const dynamic = 'force-dynamic';

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
  const projectPath = process.env.npm_config_project_path;
  if (!projectPath) {
    return new NextResponse('project_path not set', { status: 500 });
  }

  const urlComponents = request.nextUrl.pathname.split('/');
  const filename = decodeURI(urlComponents?.pop() || ''); // filename should unescaped
  urlComponents?.pop();
  const cardKey = urlComponents?.pop();

  if (filename == null || cardKey == null) {
    return new NextResponse('Missing cardKey or filename', { status: 400 });
  }

  const commands = CommandManager.getInstance(projectPath);
  try {
    const attachmentResponse = await commands.showCmd.showAttachment(
      cardKey,
      filename,
    );

    if (!attachmentResponse) {
      return new NextResponse(
        `No attachment found from card ${cardKey} and filename ${filename}`,
        { status: 404 },
      );
    }

    const payload: attachmentPayload = attachmentResponse as attachmentPayload;

    return new NextResponse(payload.fileBuffer, {
      headers: {
        'Content-Type': payload.mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return new NextResponse(
      `No attachemnt found from card ${cardKey} and filename ${filename}`,
      { status: 404 },
    );
  }
}
