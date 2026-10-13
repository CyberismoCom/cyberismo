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
import { resourceName } from '@cyberismo/data-handler';

export async function getTemplatesWithDetails(ws: Workspace) {
  const response = await ws.showCmd.showTemplatesWithDetails();
  if (!response) {
    throw new Error('No templates found');
  }
  return response;
}

export async function createTemplate(ws: Workspace, templateName: string) {
  await ws.createCmd.createTemplate(templateName, '');
}

export async function addTemplateCard(
  ws: Workspace,
  template: string,
  cardType: string,
  parentKey?: string,
  count?: number,
) {
  const { identifier, type } = resourceName(template);
  if (type !== 'templates') {
    throw new Error('Invalid template resource');
  }
  const added = await ws.cards.addToTemplate(
    cardType,
    identifier,
    parentKey,
    count,
  );
  if (!added || added.length === 0) {
    throw new Error('No cards created');
  }
  return added;
}
