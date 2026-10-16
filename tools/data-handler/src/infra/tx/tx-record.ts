// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ActorRef, ChangeCause, ChangeEvent } from '@cyberismo/model';

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
  agent: 'Cyberismo-Agent',
} as const;

/** What the outermost write did and on whose behalf. */
export interface TxRecord {
  actor: ActorRef;
  /** Git author; unset lets git resolve it (env, config, then the Bot). */
  identity?: CommitIdentity;
  message?: string;
  cause?: ChangeCause;
  touched: {
    cards: { updated: Set<string>; removed: Set<string> };
    resources: Set<string>;
    modules: Set<string>;
    settings: boolean;
  };
  /** Full SHA of the write's commit, if it made one. */
  commit?: string;
  /** Event to publish once the lock is released. */
  event?: ChangeEvent;
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
      settings: false,
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
