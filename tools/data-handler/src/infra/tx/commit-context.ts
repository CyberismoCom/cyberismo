// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { AsyncLocalStorage } from 'node:async_hooks';

export interface CommitContext {
  message?: string;
}

const context = new AsyncLocalStorage<CommitContext>();

export function runWithCommitContext<T>(
  ctx: CommitContext,
  fn: () => Promise<T>,
): Promise<T> {
  const current = context.getStore();
  const merged = { ...current, ...ctx };
  return context.run(merged, fn);
}

export function getCommitContext(): CommitContext {
  return context.getStore() ?? {};
}

/** Runs `fn` synchronously with no commit context. */
export function outsideCommitContext<T>(fn: () => T): T {
  return context.exit(fn);
}

export function runWithDefaultCommitMessage<T>(
  message: string,
  fn: () => Promise<T>,
): Promise<T> {
  return getCommitContext().message !== undefined
    ? fn()
    : runWithCommitContext({ message }, fn);
}
