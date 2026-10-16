// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Who performed a write. Carries no email: the git author is kept apart,
 * inside data-handler.
 */
export interface ActorRef {
  /** 'connector' is a service account; 'system' is Cyberismo itself. */
  kind: 'user' | 'connector' | 'system';
  id: string;
  name: string;
  /** Set when an agent (e.g. an MCP client) acted for the actor. */
  agent?: { name: string };
}
