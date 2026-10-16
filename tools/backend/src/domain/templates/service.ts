// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Workspace } from '@cyberismo/data-handler';
import { resourceName } from '@cyberismo/data-handler';

export async function getTemplatesWithDetails(ws: Workspace) {
  const response = await ws.resources.contents('templates');
  if (!response) {
    throw new Error('No templates found');
  }
  return response;
}

export async function createTemplate(ws: Workspace, templateName: string) {
  await ws.resources.create(templateName, 'templates', {});
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
