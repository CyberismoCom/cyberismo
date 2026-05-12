/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.

  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { CommandManager, ProjectProvider } from '@cyberismo/data-handler';

export type { ProjectProvider } from '@cyberismo/data-handler';

/**
 * Resolve a CommandManager from the provider based on projectPrefix.
 * Throws if the prefix is unknown or no projects are available.
 */
export function resolveCommands(
  provider: ProjectProvider,
  projectPrefix: string,
): CommandManager {
  const commands = provider.get(projectPrefix);
  if (!commands) {
    const available = provider.list().map((p) => p.prefix);
    throw new Error(
      available.length === 0
        ? 'No projects available.'
        : `Unknown project '${projectPrefix}'. Available projects: ${available.join(', ')}. Ask the user which project to use before retrying.`,
    );
  }
  return commands;
}
