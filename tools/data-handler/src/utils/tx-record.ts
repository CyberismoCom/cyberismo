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

import type { ActorRef } from '@cyberismo/model';
import type { CommitContext, CommitIdentity } from './commit-context.js';

/** Actor of writes that no user started. */
export const SYSTEM_ACTOR: ActorRef = {
  kind: 'system',
  id: 'cyberismo',
  name: 'Cyberismo Bot',
};

/** Git trailer keys that record who acted. */
export const COMMIT_TRAILERS = {
  agent: 'Cyberismo-Agent',
} as const;

/** What the outermost write did and on whose behalf. */
export interface TxRecord {
  actor: ActorRef;
  /** Git author; unset lets git resolve it (env, config, then the Bot). */
  identity?: CommitIdentity;
  message?: string;
  cause?: string;
  touched: {
    cards: { updated: Set<string>; removed: Set<string> };
    resources: Set<string>;
    modules: Set<string>;
  };
}

/**
 * Creates the record of a new outermost write.
 * @param ctx Commit context; without an actor the write is the system's.
 */
export function createTxRecord(ctx: CommitContext): TxRecord {
  return {
    actor: ctx.actor ?? SYSTEM_ACTOR,
    identity: ctx.author,
    message: ctx.message,
    touched: {
      cards: { updated: new Set(), removed: new Set() },
      resources: new Set(),
      modules: new Set(),
    },
  };
}

/**
 * Git trailers that record the agent of a commit, if the actor has one.
 * @param actor Who acted.
 */
export function commitTrailers(actor: ActorRef): Record<string, string> {
  const trailers: Record<string, string> = {};
  if (actor.agent?.name) {
    trailers[COMMIT_TRAILERS.agent] = actor.agent.name;
  }
  return trailers;
}
