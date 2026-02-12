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

interface LockContext {
  mode: 'read' | 'write';
  active: boolean;
}

/**
 * Promise-based read-write lock with writer priority and reentrancy.
 *
 * - Multiple concurrent readers are allowed.
 * - Writers get exclusive access.
 * - Writer-priority: new readers block when a writer is waiting.
 * - Reentrancy via AsyncLocalStorage: nested lock calls within the same
 *   async context are no-ops.
 * - After-write hooks fire after the outermost write completes successfully.
 */
export class RWLock {
  private readers = 0;
  private writer = false;
  private readerQueue: (() => void)[] = [];
  private writerQueue: (() => void)[] = [];
  private context = new AsyncLocalStorage<LockContext>();
  private afterWriteHooks: (() => Promise<void>)[] = [];
  private writeErrorHooks: ((error: unknown) => Promise<void>)[] = [];

  /**
   * Register a callback that fires after the outermost write completes
   * successfully. Hooks run while still holding the write lock.
   */
  onAfterWrite(hook: () => Promise<void>): void {
    this.afterWriteHooks.push(hook);
  }

  /**
   * Register a callback that fires when the outermost write fails.
   * Hooks run while still holding the write lock.
   */
  onWriteError(hook: (error: unknown) => Promise<void>): void {
    this.writeErrorHooks.push(hook);
  }

  /**
   * Execute `fn` under a read lock. Concurrent readers are allowed.
   * If already inside a read or write context, just runs fn directly.
   */
  async read<T>(fn: () => Promise<T>): Promise<T> {
    const current = this.context.getStore();
    if (current?.active) {
      return fn();
    }

    await this.acquireRead();
    const ctx: LockContext = { mode: 'read', active: true };
    try {
      return await this.context.run(ctx, fn);
    } finally {
      ctx.active = false;
      this.releaseRead();
    }
  }

  /**
   * Execute `fn` under an exclusive write lock.
   * If already inside a write context, just runs fn directly (no hooks).
   */
  async write<T>(fn: () => Promise<T>): Promise<T> {
    const current = this.context.getStore();
    if (current?.active && current.mode === 'write') {
      return fn();
    }
    if (current?.active && current.mode === 'read') {
      throw new Error('Cannot acquire write lock while holding read lock');
    }

    await this.acquireWrite();
    const ctx: LockContext = { mode: 'write', active: true };
    try {
      const result = await this.context.run(ctx, fn);
      // Fire after-write hooks while still holding the lock
      for (const hook of this.afterWriteHooks) {
        await hook();
      }
      return result;
    } catch (error) {
      // Run rollback hooks on error (outermost write only)
      for (const hook of this.writeErrorHooks) {
        await hook(error);
      }
      throw error;
    } finally {
      ctx.active = false;
      this.releaseWrite();
    }
  }

  private acquireRead(): Promise<void> {
    if (!this.writer && this.writerQueue.length === 0) {
      this.readers++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.readerQueue.push(() => {
        this.readers++;
        resolve();
      });
    });
  }

  private releaseRead(): void {
    this.readers--;
    if (this.readers === 0 && this.writerQueue.length > 0) {
      const next = this.writerQueue.shift()!;
      next();
    }
  }

  private acquireWrite(): Promise<void> {
    if (!this.writer && this.readers === 0) {
      this.writer = true;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.writerQueue.push(() => {
        this.writer = true;
        resolve();
      });
    });
  }

  private releaseWrite(): void {
    this.writer = false;
    if (this.writerQueue.length > 0) {
      const next = this.writerQueue.shift()!;
      next();
    } else {
      // Wake ALL waiting readers
      const readers = this.readerQueue.splice(0);
      for (const wake of readers) {
        wake();
      }
    }
  }
}

// Helper to access the lock from a command instance via its `project` property.
function getLock(instance: object): RWLock {
  const lock = (instance as { project?: { lock?: RWLock } }).project?.lock;
  if (!lock) {
    throw new Error(
      '@read/@write decorator: instance.project.lock is not defined. ' +
        'Ensure the class has a `project` property with `lock: RWLock`.',
    );
  }
  return lock;
}

/**
 * A Helper decorator built for commands that automatically handles using a read lock
 */
export function read<This extends object, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Promise<Return>,
): (this: This, ...args: Args) => Promise<Return> {
  return function (this: This, ...args: Args): Promise<Return> {
    return getLock(this).read(() => target.call(this, ...args));
  };
}

/**
 * A Helper decorator built for commands that automatically handles using a write lock
 */
export function write<This extends object, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Promise<Return>,
): (this: This, ...args: Args) => Promise<Return> {
  return function (this: This, ...args: Args): Promise<Return> {
    return getLock(this).write(() => target.call(this, ...args));
  };
}
