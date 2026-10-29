// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Workspace } from '@cyberismo/data-handler';

export async function getLinkTypes(ws: Workspace) {
  const response = await ws.resources.list('linkTypes');
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
