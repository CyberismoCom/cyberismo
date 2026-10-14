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

import type { Checkout } from '../containers/project.js';
import type { RemovableResourceTypes } from '@cyberismo/model';
import { write } from '../utils/rw-lock.js';
import type { CommitIdentity } from '../utils/tx-record.js';
import type { ActorRef } from '@cyberismo/model';

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
    public readonly actor: ActorRef,
    public readonly identity?: CommitIdentity,
  ) {}

  /**
   * Refuses a type no remove handles; modules go through the modules façade.
   */
  @write((type, targetName) => `Remove ${type} ${targetName}`)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- named in the commit subject
  public async remove(type: RemovableResourceTypes, targetName: string) {
    throw new Error(`Unknown resource type '${type}'`);
  }
}
