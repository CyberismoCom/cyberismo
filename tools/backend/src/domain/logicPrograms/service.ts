// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Workspace } from '@cyberismo/data-handler';
import type { ResourceParamsWithCard } from '../../common/validationSchemas.js';

export async function getLogicProgram(
  ws: Workspace,
  resource: ResourceParamsWithCard,
) {
  if (resource.type === 'cards') {
    return ws.cards.logicProgram(resource.identifier);
  } else {
    return ws.queries.logicProgram(resource);
  }
}
