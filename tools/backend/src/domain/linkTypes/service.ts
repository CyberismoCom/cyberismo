/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { Workspace } from '@cyberismo/data-handler';

export async function getLinkTypes(ws: Workspace) {
  const response = await ws.showCmd.showResources('linkTypes');
  if (!response) {
    throw new Error('No link types found');
  }

  const linkTypes = await Promise.all(
    response.map((linkType: string) => ws.resources.show(linkType)),
  );

  return linkTypes;
}

export async function createLinkType(ws: Workspace, linkTypeName: string) {
  await ws.resources.create(linkTypeName, 'linkTypes', {});
}
