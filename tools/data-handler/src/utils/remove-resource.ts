/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { pluralResourceType } from '../containers/project/resource-handler.js';
import type { Workspace } from '../workspace/workspace.js';
import { resourceName } from './resource-utils.js';

/**
 * Deletes a resource as one write 'Remove <type> <name>'; a bare identifier
 * is taken to be in this project.
 */
export async function removeResource(
  ws: Workspace,
  type: string,
  name: string,
): Promise<void> {
  await ws.atomic(async () => {
    const parsed = resourceName(name);
    await ws.changes.apply({
      kind: 'delete',
      target: {
        prefix: parsed.prefix || ws.settings.prefix,
        type: parsed.type || pluralResourceType(type),
        identifier: parsed.identifier,
      },
    });
  }, `Remove ${type} ${name}`);
}
