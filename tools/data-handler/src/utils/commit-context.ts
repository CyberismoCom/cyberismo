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

export interface CommitContext {
  message?: string;
  author?: { name: string; email: string };
}

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
