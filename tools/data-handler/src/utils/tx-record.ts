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

/** Git author of a commit. Internal: never serialised into events. */
export interface CommitIdentity {
  name: string;
  email: string;
}

/** Actor of writes that no user started. */
export const SYSTEM_ACTOR: ActorRef = {
  kind: 'system',
  id: 'cyberismo',
  name: 'Cyberismo Bot',
};

/** Who an outermost write is done for. */
export interface WriteFrame {
  actor: ActorRef;
  /** Git author; unset lets git resolve it (env, config, then the Bot). */
  identity?: CommitIdentity;
}

/** Frame of writes that no user started. */
export const SYSTEM_FRAME: WriteFrame = { actor: SYSTEM_ACTOR };

/** Git trailer keys that record who acted. */
export const COMMIT_TRAILERS = {
  actor: 'Cyberismo-Actor',
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
 * @param frame Who the write is done for.
 * @param message Commit message, if one is known yet.
 */
export function createTxRecord(frame: WriteFrame, message?: string): TxRecord {
  return {
    actor: frame.actor,
    identity: frame.identity,
    message,
    touched: {
      cards: { updated: new Set(), removed: new Set() },
      resources: new Set(),
      modules: new Set(),
    },
  };
}

/**
 * Git trailers that record the actor of a commit.
 * @param actor Who acted.
 */
export function commitTrailers(actor: ActorRef): Record<string, string> {
  const trailers: Record<string, string> = {
    [COMMIT_TRAILERS.actor]: `${actor.kind}:${actor.id}`,
  };
  if (actor.agent?.name) {
    trailers[COMMIT_TRAILERS.agent] = actor.agent.name;
  }
  return trailers;
}
