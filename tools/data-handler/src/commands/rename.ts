/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { type Project } from '../containers/project.js';
import { ResourceMutations } from '../mutations/resource-mutations.js';
import { write } from '../utils/rw-lock.js';

/**
 * Handles the 'rename' command: routes a project-prefix rename through the
 * mutations engine, which performs the cascade and records the log entry.
 */
export class Rename {
  /**
   * Creates an instance of Rename command.
   * @param project Project instance to use.
   */
  constructor(private project: Project) {}

  /**
   * Renames project prefix.
   * @throws if trying to use empty 'to'
   * @throws if trying to rename with the current name
   * @throws if the new prefix is not a valid prefix
   * @param to New project prefix
   */
  @write((to) => `Rename project prefix to ${to}`)
  public async rename(to: string) {
    if (!to) {
      throw new Error(`Input validation error: empty 'to' is not allowed`);
    }
    const mutations = new ResourceMutations(this.project);
    await mutations.apply({ kind: 'project_rename', newPrefix: to });
  }
}
