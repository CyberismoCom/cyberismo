/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { ActorRef, ChangeEvent, MutationInput } from '@cyberismo/model';
import type { Checkout } from '../containers/project.js';
import { ResourceMutations } from '../mutations/resource-mutations.js';
import { write } from '../utils/rw-lock.js';
import type { CommitIdentity } from '../utils/tx-record.js';

/**
 * Resource changes of one handle. Writes through it are the handle's
 * actor's. Holds no state of its own.
 */
export class Changes {
  private readonly mutations: ResourceMutations;

  constructor(
    private readonly checkout: Checkout,
    public readonly actor: ActorRef,
    public readonly identity: CommitIdentity | undefined,
  ) {
    this.mutations = new ResourceMutations(checkout);
  }

  /**
   * Applies a resource create, edit, rename or delete with its cascade, and
   * logs it unless it is classified 'none'.
   */
  @write()
  public async apply(input: MutationInput): Promise<void> {
    await this.mutations.apply(input);
  }

  /**
   * Calls `listener` with the event of each write to the checkout, whoever
   * made it, once the write has released its lock.
   * @returns a function that unsubscribes the listener.
   */
  public subscribe(listener: (event: ChangeEvent) => void): () => void {
    return this.checkout.changeFeed.subscribe(listener);
  }
}
