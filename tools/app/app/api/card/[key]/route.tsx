/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { NextRequest, NextResponse } from 'next/server';
import { executeCardQuery } from '../../../lib/server/query';
export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/card
 *   get:
 *     summary: Returns everything required by treeview
 *     description: Returns the query result
 *     responses:
 *       200:
 *        description: Object containing the query result
 *       500:
 *         description: project_path not set or other internal error
 */
export async function GET(
  _: NextRequest,
  props: {
    params: Promise<{
      key: string;
    }>;
  },
) {
  const params = await props.params;
  const projectPath = process.env.npm_config_project_path;
  if (!projectPath) {
    return new NextResponse('project_path environment variable not set.', {
      status: 500,
    });
  }
  try {
    return NextResponse.json(await executeCardQuery(projectPath, params.key));
  } catch (e) {
    return new NextResponse((e instanceof Error && e.message) || '', {
      status: 500,
    });
  }
}
