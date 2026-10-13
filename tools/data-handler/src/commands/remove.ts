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

import type { Fetch } from './fetch.js';
import type { Modules } from './modules.js';
import type { Checkout } from '../containers/project.js';
import type { RemovableResourceTypes } from '@cyberismo/model';
import { write } from '../utils/rw-lock.js';

/**
 * Remove command.
 */
export class Remove {
  /**
   * Creates a new instance of Remove command.
   * @param project Project instance to use
   */
  constructor(
    private checkout: Checkout,
    private fetchCmd: Fetch,
    private modulesCmd: Modules,
  ) {}

  /**
   * Removes an imported module from project.
   */
  @write((type, targetName) => `Remove ${type} ${targetName}`)
  public async remove(type: RemovableResourceTypes, targetName: string) {
    if (type === 'module') {
      // Ensure module list is up to date when removing modules
      await this.fetchCmd.ensureModuleListUpToDate();
      return this.modulesCmd.remove(targetName);
    }
    throw new Error(`Unknown resource type '${type}'`);
  }
}
