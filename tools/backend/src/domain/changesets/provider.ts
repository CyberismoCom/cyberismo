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

import type { ProjectProvider } from '@cyberismo/data-handler';
import type { ProjectRegistry } from '../../project-registry.js';
import type { UserInfo } from '../../types.js';

/**
 * A project provider for one user, serving each project from that user's
 * active changeSet when they have one: what the MCP server uses, so that an
 * agent works wherever its user works.
 * @param registry - Registry holding the projects and their changeSets.
 * @param base - Provider deciding which projects are available.
 * @param user - The user the provider serves.
 */
export function changeSetProvider(
  registry: ProjectRegistry,
  base: ProjectProvider,
  user: UserInfo,
): ProjectProvider {
  const project = (prefix: string) => {
    const main = base.get(prefix);
    if (!main) {
      throw new Error(`Unknown project '${prefix}'`);
    }
    return { main, changeSets: registry.changeSetsFor(main) };
  };
  return {
    get: (prefix) => base.get(prefix),
    list: () => base.list(),
    async resolve(prefix) {
      const main = base.get(prefix);
      if (!main) {
        return undefined;
      }
      const active = await registry.changeSetsFor(main).getActive(user.id);
      return active ? registry.openChangeSet(main, active.id) : main;
    },
    changeSets: {
      active: (prefix) => project(prefix).changeSets.getActive(user.id),
      async start(prefix, title) {
        const { main, changeSets } = project(prefix);
        const info = await changeSets.create(title);
        await changeSets.setActive(user.id, info.id);
        registry.announceChangeSet(main, info.id, 'created', user);
        return info;
      },
      async changes(prefix) {
        const { changeSets } = project(prefix);
        const active = await changeSets.getActive(user.id);
        return active ? changeSets.changes(active.id) : undefined;
      },
    },
  };
}
