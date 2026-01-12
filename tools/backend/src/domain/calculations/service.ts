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

import type { CommandManager } from '@cyberismo/data-handler';
import { updateResourceWithOperation } from '../resources/service.js';

/**
 * Capitalizes the first letter of a string.
 */
function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export async function createCalculation(
  commands: CommandManager,
  identifier: string,
) {
  await commands.createCmd.createCalculation(identifier);

  // Set displayName to capitalized version of identifier
  const project = await commands.showCmd.showProject();
  await updateResourceWithOperation(
    commands,
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
}
