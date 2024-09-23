/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { NextRequest, NextResponse } from 'next/server';
import { Show } from '@cyberismocom/data-handler/show';

export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/cardtypes/{key}:
 *   get:
 *     summary: Returns the full content of a specific card type.
 *     description: The key parameter is the unique identifier ("cardtype") of the card type. The response includes the card type details.
 *     responses:
 *       200:
 *        description: Object containing card type details. See definitions.ts/CardType for the structure.
 *       400:
 *         description: Error in reading project details.
 *       500:
 *         description: project_path not set or other internal error
 */
export async function GET(request: NextRequest) {
  const projectPath = process.env.npm_config_project_path;
  if (!projectPath) {
    return new NextResponse('project_path not set', { status: 500 });
  }

  // Cardtype name delivered in url parameter 'name' because it usually contains a path
  const url = new URL(request.nextUrl);
  const cardtype = url.searchParams.get('name');
  if (!cardtype) {
    return new NextResponse('No cardtype', { status: 400 });
  }

  const show = new Show();
  const detailsResponse = await show.showCardTypeDetails(projectPath, cardtype);

  if (detailsResponse) {
    return NextResponse.json(detailsResponse);
  } else {
    return new NextResponse(`No card type details found for ${cardtype}`, {
      status: 500,
    });
  }
}
