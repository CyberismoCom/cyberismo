// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { AsyncLocalStorage } from 'node:async_hooks';
import {
  getCommitContext,
  outsideCommitContext,
  runWithDefaultCommitMessage,
} from './commit-context.js';
import { MissingActorError } from '../../shared/exceptions/index.js';
import { getChildLogger } from '../../shared/utils/log-utils.js';
import { createTxRecord, type TxRecord, type WriteFrame } from './tx-record.js';

interface LockContext {
  mode: 'read' | 'write';
  active: boolean;
  /** Record of the outermost write; shared by the writes nested in it. */
  tx?: TxRecord;
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
 * - The outermost write needs a WriteFrame and creates a TxRecord from it;
 *   nested writes join that record. The hooks receive it.
 * - Release hooks get the record after the outermost write has released the
 *   lock, whatever its outcome.
 */
export class RWLock {
  private readers = 0;
  private writer = false;
  private readerQueue: (() => void)[] = [];
  private writerQueue: (() => void)[] = [];
  private context = new AsyncLocalStorage<LockContext>();
  private afterWriteHooks: ((tx: TxRecord) => Promise<void>)[] = [];
  private writeErrorHooks: ((error: unknown, tx: TxRecord) => Promise<void>)[] =
    [];
  private releaseHooks: ((tx: TxRecord) => void)[] = [];
  private readonly logger;

  constructor(private readonly name: string = 'RWLock') {
    this.logger = getChildLogger({ module: 'RWLock', name });
  }

  /**
   * Register a callback that fires after the outermost write completes
   * successfully. Hooks run while still holding the write lock.
   */
  onAfterWrite(hook: (tx: TxRecord) => Promise<void>): void {
    this.afterWriteHooks.push(hook);
  }

  /**
   * Register a callback that fires when the outermost write fails.
   * Hooks run while still holding the write lock.
   */
  onWriteError(hook: (error: unknown, tx: TxRecord) => Promise<void>): void {
    this.writeErrorHooks.push(hook);
  }

  /**
   * Register a callback that fires after the outermost write has released
   * the lock, outside its context, whether the write succeeded or not.
   * Hooks run synchronously; a hook's error is logged and swallowed.
   */
  onReleased(hook: (tx: TxRecord) => void): void {
    this.releaseHooks.push(hook);
  }

  /** Record of the write being run in this async context, if any. */
  currentTx(): TxRecord | undefined {
    const current = this.context.getStore();
    return current?.active ? current.tx : undefined;
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
   * If already inside a write context, joins it: runs fn directly (no hooks),
   * and gives the record the commit message if it has none yet.
   * @param frame Actor of the write; required unless the write is nested.
   * @throws MissingActorError when an outermost write has no frame.
   */
  async write<T>(fn: () => Promise<T>): Promise<T>;
  async write<T>(frame: WriteFrame, fn: () => Promise<T>): Promise<T>;
  async write<T>(
    frameOrFn: WriteFrame | (() => Promise<T>),
    maybeFn?: () => Promise<T>,
  ): Promise<T> {
    const [frame, fn] =
      typeof frameOrFn === 'function'
        ? [undefined, frameOrFn]
        : [frameOrFn, maybeFn!];
    const current = this.context.getStore();
    if (current?.active && current.mode === 'write') {
      current.tx!.message ??= getCommitContext().message;
      return fn();
    }
    if (current?.active && current.mode === 'read') {
      throw new Error('Cannot acquire write lock while holding read lock');
    }
    if (!frame) {
      throw new MissingActorError();
    }

    await this.acquireWrite();
    const tx = createTxRecord(frame, getCommitContext().message);
    const ctx: LockContext = { mode: 'write', active: true, tx };
    try {
      const result = await this.context.run(ctx, fn);
      // Fire after-write hooks while still holding the lock
      for (const hook of this.afterWriteHooks) {
        await this.context.run(ctx, () => hook(tx));
      }
      return result;
    } catch (error) {
      // Run rollback hooks on error (outermost write only)
      for (const hook of this.writeErrorHooks) {
        await this.context.run(ctx, () => hook(error, tx));
      }
      throw error;
    } finally {
      ctx.active = false;
      this.releaseWrite();
      // releaseWrite() hands the lock to the next queued writer, but that
      // writer resumes on a later microtask. Running the hooks synchronously
      // here keeps their order the order of the writes; awaiting would not.
      // Outside the writer's commit context, so a hook's own write does not
      // take the writer's message.
      outsideCommitContext(() => {
        for (const hook of this.releaseHooks) {
          try {
            hook(tx);
          } catch (error) {
            this.logger.error({ error }, 'release hook failed');
          }
        }
      });
    }
  }

  private acquireRead(): Promise<void> {
    if (!this.writer && this.writerQueue.length === 0) {
      this.readers++;
      this.logger.trace({ readers: this.readers }, 'read lock acquired');
      return Promise.resolve();
    }
    this.logger.debug(
      {
        readers: this.readers,
        writer: this.writer,
        writerQueueDepth: this.writerQueue.length,
        readerQueueDepth: this.readerQueue.length,
      },
      'read lock queued (writer active or pending)',
    );
    return new Promise<void>((resolve) => {
      this.readerQueue.push(() => {
        this.readers++;
        this.logger.debug(
          {
            readers: this.readers,
            writerQueueDepth: this.writerQueue.length,
            readerQueueDepth: this.readerQueue.length,
          },
          'read lock acquired after wait',
        );
        resolve();
      });
    });
  }

  private releaseRead(): void {
    this.readers--;
    this.logger.trace(
      {
        readers: this.readers,
        writerQueueDepth: this.writerQueue.length,
        readerQueueDepth: this.readerQueue.length,
      },
      'read lock released',
    );
    if (this.readers === 0 && this.writerQueue.length > 0) {
      const next = this.writerQueue.shift()!;
      next();
    }
  }

  private acquireWrite(): Promise<void> {
    if (!this.writer && this.readers === 0) {
      this.writer = true;
      this.logger.trace(
        {
          readers: this.readers,
          writerQueueDepth: this.writerQueue.length,
          readerQueueDepth: this.readerQueue.length,
        },
        'write lock acquired',
      );
      return Promise.resolve();
    }
    this.logger.debug(
      {
        readers: this.readers,
        writer: this.writer,
        writerQueueDepth: this.writerQueue.length,
        readerQueueDepth: this.readerQueue.length,
      },
      `write lock queued (readers: ${this.readers}, writer active: ${this.writer})`,
    );
    return new Promise<void>((resolve) => {
      this.writerQueue.push(() => {
        this.writer = true;
        this.logger.debug(
          {
            readers: this.readers,
            writerQueueDepth: this.writerQueue.length,
            readerQueueDepth: this.readerQueue.length,
          },
          'write lock acquired after wait',
        );
        resolve();
      });
    });
  }

  private releaseWrite(): void {
    this.writer = false;
    this.logger.trace(
      {
        readers: this.readers,
        writerQueueDepth: this.writerQueue.length,
        readerQueueDepth: this.readerQueue.length,
      },
      'write lock released',
    );
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

// Helper to access the lock from a command instance via its `checkout` property.
function getLock(instance: object): RWLock {
  const lock = (instance as { checkout?: { lock?: RWLock } }).checkout?.lock;
  if (!lock) {
    throw new Error(
      '@read/@write decorator: instance.checkout.lock is not defined. ' +
        'Ensure the class has a `checkout` property with `lock: RWLock`.',
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

// An API class, or a command made for a handle, carries its actor and identity.
function handleFrame(instance: object): WriteFrame | undefined {
  const { actor, identity } = instance as Partial<WriteFrame>;
  return actor ? { actor, identity } : undefined;
}

/**
 * A Helper decorator built for commands that automatically handles using a write lock.
 *
 * Two forms:
 * - `@write()`: just acquires the write lock, no commit message (for wrapper methods)
 * - `@write((param) => \`Do ${param}\`)`: acquires the write lock and sets a default commit message
 */
export function write<This extends object, Args extends unknown[], Return>(): (
  target: (this: This, ...args: Args) => Promise<Return>,
) => (this: This, ...args: Args) => Promise<Return>;

export function write<This extends object, Args extends unknown[], Return>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: (...args: any[]) => string,
): (
  target: (this: This, ...args: Args) => Promise<Return>,
) => (this: This, ...args: Args) => Promise<Return>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function write(message?: (...args: any[]) => string): unknown {
  return function (target: (...args: unknown[]) => Promise<unknown>) {
    return function (this: object, ...args: unknown[]) {
      const run = () => {
        const fn = () => target.call(this, ...args);
        const frame = handleFrame(this);
        return frame ? getLock(this).write(frame, fn) : getLock(this).write(fn);
      };
      if (!message) {
        return run();
      }
      const label = message(...args);
      return runWithDefaultCommitMessage(label, run);
    };
  };
}
