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
 * /api/cards/{key}/a:
 *   post:
 *     summary: Used to upload an attachment to a card.
 *     responses:
 *       204:
 *         description: Attachments uploaded successfully.
 *       400:
 *         description: Failed to upload attachment.
 *       500:
 *         description: project_path not set or other internal error
 */
export async function POST(
  request: Request,
  {
    params,
  }: {
    params: {
      key: string;
    };
  },
) {
  const projectPath = process.env.npm_config_project_path;
  if (!projectPath) {
    return new NextResponse('project_path environment variable not set.', {
      status: 500,
    });
  }

  const formData = await request.formData();
  // get all the files from the form data
  const files = await Promise.all(
    formData
      .getAll('file')
      .filter((file): file is File => file instanceof File)
      .reduce<File[]>((files, file) => {
        if (files.find((f) => f.name === file.name)) {
          return files;
        }
        files.push(file);
        return files;
      }, [])
      .map(async (file) => ({
        name: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
      })),
  );

  const commands = CommandManager.getInstance(projectPath);

  const succeeded = [];
  let error: Error | null = null;
  for (const file of files) {
    try {
      await commands.createCmd.createAttachment(
        params.key,
        file.name,
        file.buffer,
      );
      succeeded.push(file.name);
    } catch (err) {
      error =
        err instanceof Error ? err : new Error('Failed to upload attachment.');
      break;
    }
  }

  if (error) {
    for (const file of succeeded) {
      try {
        await commands.removeCmd.remove('attachment', params.key, file);
      } catch (error) {
        return new NextResponse('Failed to delete attachment.', {
          status: 500,
        });
      }
    }
    return new NextResponse(error.message, { status: 400 });
  }

  return new NextResponse(null, { status: 204 });
}
