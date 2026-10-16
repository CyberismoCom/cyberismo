// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ActorRef, ChangeEvent, MutationInput } from '@cyberismo/model';
import type { Checkout } from '../state/checkout/checkout.js';
import { ResourceMutations } from '../domain/resources/index.js';
import { write } from '../infra/tx/rw-lock.js';
import type { CommitIdentity } from '../infra/tx/tx-record.js';

/**
 * Resource changes of one handle. Writes through it are the handle's
 * actor's. Holds no state of its own.
 */
export class Changes {
  private readonly mutations: ResourceMutations;

  /** @internal */
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
