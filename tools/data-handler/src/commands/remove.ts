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

import type { Checkout } from '../infra/checkout.js';
import type { Workspace } from '../workspace/workspace.js';
import type { RemovableResourceTypes } from '@cyberismo/model';
import { write } from '../infra/rw-lock.js';
import type { CommitIdentity } from '../utils/tx-record.js';
import type { ActorRef } from '@cyberismo/model';

/**
 * Remove command.
 */
export class Remove {
  private readonly checkout: Checkout;
  public readonly actor: ActorRef;
  public readonly identity?: CommitIdentity;

  /** Acts on the handle's project as its actor. */
  constructor(ws: Workspace) {
    this.checkout = ws.checkout;
    this.actor = ws.actor;
    this.identity = ws.identity;
  }

  /**
   * Refuses a type no remove handles; modules go through the modules façade.
   */
  @write((type, targetName) => `Remove ${type} ${targetName}`)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- named in the commit subject
  public async remove(type: RemovableResourceTypes, targetName: string) {
    throw new Error(`Unknown resource type '${type}'`);
  }
}
