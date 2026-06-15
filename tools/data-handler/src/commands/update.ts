/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { Project } from '../containers/project.js';
import { ResourceMutations } from '../mutations/resource-mutations.js';
import type { MutationInput } from '../mutations/types.js';

/**
 * Class that handles 'update' commands.
 */
export class Update {
  private readonly mutations: ResourceMutations;

  /**
   * Creates an instance of Update command.
   * @param project Project to use.
   */
  constructor(private project: Project) {
    this.mutations = new ResourceMutations(project);
  }

  /**
   * Applies a resource mutation through the mutation engine, which dispatches
   * to a handler that performs the change, its cascade and — for breaking
   * changes — records a migration log entry.
   * @param input The mutation to apply.
   */
  public async apply(input: MutationInput): Promise<void> {
    await this.mutations.apply(input);
  }
}
