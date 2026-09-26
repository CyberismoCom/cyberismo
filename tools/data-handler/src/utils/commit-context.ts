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

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Who performed a write: a person directly, or an agent acting on behalf of
 * the commit author (e.g. through MCP).
 */
export type CommitActor = { kind: 'human' } | { kind: 'agent'; name?: string };

/** Author of a write. 'id' identifies the user to the app; git ignores it. */
export interface CommitAuthor {
  name: string;
  email: string;
  id?: string;
}

export interface CommitContext {
  message?: string;
  author?: CommitAuthor;
  actor?: CommitActor;
}

/** Git trailer keys used to record write provenance. */
export const COMMIT_TRAILERS = {
  actor: 'Cyberismo-Actor',
  agent: 'Cyberismo-Agent',
} as const;

const context = new AsyncLocalStorage<CommitContext>();

export function runWithCommitContext<T>(
  ctx: CommitContext,
  fn: () => Promise<T>,
): Promise<T> {
  const current = context.getStore();
  // Merge with any existing context (e.g. author set at middleware level, message set at decorator level)
  const merged = { ...current, ...ctx };
  return context.run(merged, fn);
}

export function getCommitContext(): CommitContext {
  return context.getStore() ?? {};
}

export function runWithDefaultCommitMessage<T>(
  message: string,
  fn: () => Promise<T>,
): Promise<T> {
  return getCommitContext().message !== undefined
    ? fn()
    : runWithCommitContext({ message }, fn);
}

/**
 * Git trailers describing the provenance of a commit made in this context.
 * @param ctx Commit context to describe.
 * @returns Trailer key-value pairs; empty when the actor is unknown.
 */
export function commitTrailers(ctx: CommitContext): Record<string, string> {
  if (!ctx.actor) {
    return {};
  }
  const trailers: Record<string, string> = {
    [COMMIT_TRAILERS.actor]: ctx.actor.kind,
  };
  // Trailer values must stay on one line
  const agent =
    ctx.actor.kind === 'agent'
      ? ctx.actor.name?.replace(/\s+/g, ' ').trim()
      : undefined;
  if (agent) {
    trailers[COMMIT_TRAILERS.agent] = agent;
  }
  return trailers;
}
