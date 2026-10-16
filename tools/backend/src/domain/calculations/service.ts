// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Workspace } from '@cyberismo/data-handler';
import { updateResourceWithOperation } from '../resources/service.js';

/**
 * Capitalizes the first letter of a string.
 */
function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export async function createCalculation(ws: Workspace, identifier: string) {
  await ws.atomic(async () => {
    await ws.resources.create(identifier, 'calculations', {});

    // Set displayName to capitalized version of identifier
    const project = await ws.settings.info();
    await updateResourceWithOperation(
      ws,
      { prefix: project.prefix, type: 'calculations', identifier },
      {
        updateKey: { key: 'displayName' },
        operation: {
          name: 'change',
          target: '',
          to: capitalize(identifier),
        },
      },
    );
  }, `Create calculation ${identifier}`);
}
