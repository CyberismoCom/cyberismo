/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { evaluateMacros } from '@cyberismocom/data-handler/macros';
import { NextRequest, NextResponse } from 'next/server';
import processor from '../../../lib/server/index';

export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/render/{key}:
 *   post:
 *     summary: Returns html version of cyberismo asciidoc content
 *     description: The endpoint handles the macros inside the template and uses asciidoctor to render the asciidoc into hmlt
 *     responses:
 *       200:
 *        description: OBject containing the rendered content as a string
 *       400:
 *         description: Content not provided
 *       500:
 *         description: project_path not set or other internal error
 */

export async function POST(
  request: NextRequest,
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
    return new NextResponse('project_path not set', { status: 500 });
  }

  const res = await request.json();

  if (res.content == null) {
    return new NextResponse('No content provided', { status: 400 });
  }

  const asciidocContent = await evaluateMacros(res.content, {
    projectPath,
    mode: 'inject',
    cardKey: params.key,
  });

  const htmlContent = processor
    .convert(asciidocContent, {
      safe: 'safe',
      attributes: {
        imagesdir: `/api/cards/${params.key}/a`,
        icons: 'font',
      },
    })
    .toString();

  return NextResponse.json({
    rendered: htmlContent,
  });
}
