/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { NextResponse } from 'next/server';
import { Calculate } from '@cyberismocom/data-handler/calculate';

export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/tree
 *   get:
 *     summary: Returns everything required by treeview
 *     description: Returns the query result
 *     responses:
 *       200:
 *        description: Object containing the query result
 *       500:
 *         description: project_path not set or other internal error
 */
export async function GET() {
  const projectPath = process.env.npm_config_project_path;
  if (!projectPath) {
    return new NextResponse('project_path environment variable not set.', {
      status: 500,
    });
  }
  try {
    const calculate = new Calculate();
    await calculate.generate(projectPath);
    const tree = await calculate.runQuery(projectPath, 'tree');
    if (tree.error) {
      throw new Error(tree.error);
    }
    return NextResponse.json(tree.results);
  } catch (e) {
    return new NextResponse((e instanceof Error && e.message) || '', {
      status: 500,
    });
  }
}
