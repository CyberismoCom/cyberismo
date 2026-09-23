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
 * consumers can migrate: it is refused once the project has a version,
 * unless forced. A forced rename makes the next published version a new
 * module, and consumers cannot update to it from the old one.
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
   * @throws if the project has published a version and `force` is not set
   * @param to New project prefix
   * @param force Rename even though a version has been published
   */
  @write((to) => `Rename project prefix to ${to}`)
  public async rename(to: string, force = false) {
    if (!to) {
      throw new Error(`Input validation error: empty 'to' is not allowed`);
    }
    const published = this.project.configuration.version;
    if (published && !force) {
      throw new Error(
        `Project prefix '${this.project.projectPrefix}' is this module's ` +
          `identity and was fixed when version ${published} was published. ` +
          `Consumers reference every resource and card key by that prefix, ` +
          `so a renamed module is a new module. Create a new module, or run ` +
          `'cyberismo rename ${to} --force' to rename this one; consumers ` +
          `must then install it and remove the old one.`,
      );
    }
    await renameProjectPrefix(this.project, to);
  }
}
