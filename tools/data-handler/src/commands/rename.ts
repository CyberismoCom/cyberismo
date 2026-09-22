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
import { renameProjectPrefix } from '../utils/prefix-rename.js';
import { write } from '../utils/rw-lock.js';

/**
 * Handles the 'rename' command: an authoring helper that changes a project's
 * card-key prefix and every reference to it.
 *
 * The prefix is a published module's identity, so this is not a change
 * consumers can migrate: it is refused once the project has a version.
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
   * @throws if the project has published a version
   * @param to New project prefix
   */
  @write((to) => `Rename project prefix to ${to}`)
  public async rename(to: string) {
    if (!to) {
      throw new Error(`Input validation error: empty 'to' is not allowed`);
    }
    const published = this.project.configuration.version;
    if (published) {
      throw new Error(
        `Project prefix '${this.project.projectPrefix}' is this module's ` +
          `identity and was fixed when version ${published} was published; ` +
          `it cannot be renamed. Consumers reference every resource and card ` +
          `key by that prefix. To publish under a different prefix, create a ` +
          `new module.`,
      );
    }
    await renameProjectPrefix(this.project, to);
  }
}
