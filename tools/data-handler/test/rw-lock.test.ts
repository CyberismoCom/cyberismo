import { expect } from 'chai';

import { RWLock, read, write } from '../src/utils/rw-lock.js';
import { getCommitContext } from '../src/utils/commit-context.js';
import { deferred } from './test-utils.js';

describe('RWLock', () => {
  describe('basic read/write', () => {
    it('should allow a single read', async () => {
      const lock = new RWLock();
      const result = await lock.read(async () => 42);
      expect(result).to.equal(42);
    });

    it('should allow a single write', async () => {
      const lock = new RWLock();
      const result = await lock.write(async () => 'done');
      expect(result).to.equal('done');
    });

    it('should propagate errors from read and release the lock', async () => {
      const lock = new RWLock();
      try {
        await lock.read(async () => {
          throw new Error('read error');
        });
        expect.fail('should have thrown');
      } catch (e) {
        expect((e as Error).message).to.equal('read error');
      }
      // Lock should be released — a subsequent write should work
      const result = await lock.write(async () => 'ok');
      expect(result).to.equal('ok');
    });

    it('should propagate errors from write and release the lock', async () => {
      const lock = new RWLock();
      try {
        await lock.write(async () => {
          throw new Error('write error');
        });
        expect.fail('should have thrown');
      } catch (e) {
        expect((e as Error).message).to.equal('write error');
      }
      // Lock should be released — a subsequent read should work
      const result = await lock.read(async () => 'ok');
      expect(result).to.equal('ok');
    });
  });

  describe('concurrent reads', () => {
    it('should allow concurrent reads to proceed in parallel', async () => {
      const lock = new RWLock();
      const log: string[] = [];

      const r1Started = deferred();
      const r2Started = deferred();

      const r1 = lock.read(async () => {
        log.push('r1-start');
        r1Started.resolve();
        await r2Started.promise;
        log.push('r1-end');
      });

      const r2 = lock.read(async () => {
        log.push('r2-start');
        r2Started.resolve();
        await r1Started.promise;
        log.push('r2-end');
      });

      await Promise.all([r1, r2]);

      // Both reads should start before either ends
      expect(log.indexOf('r1-start')).to.be.lessThan(log.indexOf('r1-end'));
      expect(log.indexOf('r2-start')).to.be.lessThan(log.indexOf('r2-end'));
      // Both should have started before both ended
      const starts = [log.indexOf('r1-start'), log.indexOf('r2-start')];
      const ends = [log.indexOf('r1-end'), log.indexOf('r2-end')];
      expect(Math.max(...starts)).to.be.lessThan(Math.min(...ends));
    });
  });

  describe('write exclusion', () => {
    it('should block reads while writing', async () => {
      const lock = new RWLock();
      const log: string[] = [];

      const entered = deferred();
      const proceed = deferred();

      const w1 = lock.write(async () => {
        log.push('w1-start');
        entered.resolve();
        await proceed.promise;
        log.push('w1-end');
      });

      await entered.promise;

      const r1 = lock.read(async () => {
        log.push('r1-start');
        log.push('r1-end');
      });

      proceed.resolve();

      await Promise.all([w1, r1]);

      // Read should start only after write ends
      expect(log.indexOf('w1-end')).to.be.lessThan(log.indexOf('r1-start'));
    });

    it('should block other writes while writing', async () => {
      const lock = new RWLock();
      const log: string[] = [];

      const entered = deferred();
      const proceed = deferred();

      const w1 = lock.write(async () => {
        log.push('w1-start');
        entered.resolve();
        await proceed.promise;
        log.push('w1-end');
      });

      await entered.promise;

      const w2 = lock.write(async () => {
        log.push('w2-start');
        log.push('w2-end');
      });

      proceed.resolve();

      await Promise.all([w1, w2]);

      // Second write should start only after first write ends
      expect(log.indexOf('w1-end')).to.be.lessThan(log.indexOf('w2-start'));
    });

    it('should block writes while reading', async () => {
      const lock = new RWLock();
      const log: string[] = [];

      const entered = deferred();
      const proceed = deferred();

      const r1 = lock.read(async () => {
        log.push('r1-start');
        entered.resolve();
        await proceed.promise;
        log.push('r1-end');
      });

      await entered.promise;

      const w1 = lock.write(async () => {
        log.push('w1-start');
        log.push('w1-end');
      });

      proceed.resolve();

      await Promise.all([r1, w1]);

      // Write should start only after read ends
      expect(log.indexOf('r1-end')).to.be.lessThan(log.indexOf('w1-start'));
    });
  });

  describe('writer priority', () => {
    it('should prioritize waiting writers over new readers', async () => {
      const lock = new RWLock();
      const log: string[] = [];

      const entered = deferred();
      const proceed = deferred();

      // Start a read to hold the lock
      const r1 = lock.read(async () => {
        log.push('r1-start');
        entered.resolve();
        await proceed.promise;
        log.push('r1-end');
      });

      await entered.promise;

      // Queue a writer — it should wait for r1 to finish
      const w1 = lock.write(async () => {
        log.push('w1-start');
        log.push('w1-end');
      });

      // Queue another reader — it should wait for the writer.
      const r2 = lock.read(async () => {
        log.push('r2-start');
        log.push('r2-end');
      });

      proceed.resolve();

      await Promise.all([r1, w1, r2]);

      // Writer should run before the second reader
      expect(log.indexOf('w1-start')).to.be.lessThan(log.indexOf('r2-start'));
    });
  });

  describe('reentrancy', () => {
    it('should allow nested read-in-read', async () => {
      const lock = new RWLock();
      const result = await lock.read(async () => {
        return lock.read(async () => 'nested');
      });
      expect(result).to.equal('nested');
    });

    it('should allow nested write-in-write', async () => {
      const lock = new RWLock();
      const result = await lock.write(async () => {
        return lock.write(async () => 'nested');
      });
      expect(result).to.equal('nested');
    });

    it('should allow nested read-in-write', async () => {
      const lock = new RWLock();
      const result = await lock.write(async () => {
        return lock.read(async () => 'nested');
      });
      expect(result).to.equal('nested');
    });

    it('should reject nested write-in-read', async () => {
      const lock = new RWLock();
      try {
        await lock.read(async () => {
          await lock.write(async () => 'should not reach');
        });
        expect.fail('should have thrown');
      } catch (e) {
        expect((e as Error).message).to.equal(
          'Cannot acquire write lock while holding read lock',
        );
      }
    });

    it('should not treat leaked async continuations as reentrant', async () => {
      const lock = new RWLock();
      const log: string[] = [];

      // Resolve function that will be called from inside the write scope
      let leakedResolve!: () => void;
      const leakedPromise = new Promise<void>((resolve) => {
        leakedResolve = resolve;
      });

      const leakedAttempted = deferred();

      await lock.write(async () => {
        // Schedule work that will run after the lock is released.
        // It inherits the ALS context but should NOT skip locking if it was released.
        setTimeout(() => {
          void (async () => {
            leakedAttempted.resolve();
            await lock.write(async () => {
              log.push('leaked-start');
              log.push('leaked-end');
            });
            leakedResolve();
          })();
        }, 0);

        log.push('w1');
      });

      // Start another write that should serialize with the leaked one.
      // w2 holds the lock until the leaked write has attempted acquisition.
      const w2 = lock.write(async () => {
        log.push('w2-start');
        await leakedAttempted.promise;
        log.push('w2-end');
      });

      await Promise.all([w2, leakedPromise]);

      expect(log).to.deep.equal([
        'w1',
        'w2-start',
        'w2-end',
        'leaked-start',
        'leaked-end',
      ]);
    });
  });

  describe('after-write hooks', () => {
    it('should fire after outermost write succeeds', async () => {
      const lock = new RWLock();
      const log: string[] = [];

      lock.onAfterWrite(async () => {
        log.push('hook');
      });

      await lock.write(async () => {
        log.push('write');
      });

      expect(log).to.deep.equal(['write', 'hook']);
    });

    it('should not fire hooks on inner (reentrant) writes', async () => {
      const lock = new RWLock();
      let hookCallCount = 0;

      lock.onAfterWrite(async () => {
        hookCallCount++;
      });

      await lock.write(async () => {
        await lock.write(async () => {
          // inner write
        });
      });

      expect(hookCallCount).to.equal(1);
    });

    it('should not fire hooks when write throws', async () => {
      const lock = new RWLock();
      let hookCalled = false;

      lock.onAfterWrite(async () => {
        hookCalled = true;
      });

      try {
        await lock.write(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }

      expect(hookCalled).to.equal(false);
    });

    it('should fire multiple hooks in order', async () => {
      const lock = new RWLock();
      const log: string[] = [];

      lock.onAfterWrite(async () => {
        log.push('hook1');
      });
      lock.onAfterWrite(async () => {
        log.push('hook2');
      });

      await lock.write(async () => {
        log.push('write');
      });

      expect(log).to.deep.equal(['write', 'hook1', 'hook2']);
    });
  });

  describe('write-error hooks', () => {
    it('should fire onWriteError hook when write fn throws', async () => {
      const lock = new RWLock();
      let hookCalled = false;

      lock.onWriteError(async () => {
        hookCalled = true;
      });

      try {
        await lock.write(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }

      expect(hookCalled).to.equal(true);
    });

    it('should NOT fire onWriteError hook on success', async () => {
      const lock = new RWLock();
      let hookCalled = false;

      lock.onWriteError(async () => {
        hookCalled = true;
      });

      await lock.write(async () => 'ok');

      expect(hookCalled).to.equal(false);
    });

    it('should NOT fire onWriteError hook for nested writes', async () => {
      const lock = new RWLock();
      let hookCallCount = 0;

      lock.onWriteError(async () => {
        hookCallCount++;
      });

      try {
        await lock.write(async () => {
          await lock.write(async () => {
            throw new Error('inner fail');
          });
        });
      } catch {
        // expected
      }

      // Should fire once (outermost only), not twice
      expect(hookCallCount).to.equal(1);
    });

    it('should fire onWriteError when afterWrite hook throws', async () => {
      const lock = new RWLock();
      const log: string[] = [];

      lock.onAfterWrite(async () => {
        log.push('afterWrite');
        throw new Error('commit failed');
      });

      lock.onWriteError(async () => {
        log.push('errorHook');
      });

      try {
        await lock.write(async () => {
          log.push('write');
        });
      } catch {
        // expected
      }

      expect(log).to.deep.equal(['write', 'afterWrite', 'errorHook']);
    });

    it('should pass the error object to onWriteError hooks', async () => {
      const lock = new RWLock();
      let receivedError: unknown;

      lock.onWriteError(async (error) => {
        receivedError = error;
      });

      try {
        await lock.write(async () => {
          throw new Error('specific error');
        });
      } catch {
        // expected
      }

      expect(receivedError).to.be.instanceOf(Error);
      expect((receivedError as Error).message).to.equal('specific error');
    });

    it('should run multiple onWriteError hooks in order', async () => {
      const lock = new RWLock();
      const log: string[] = [];

      lock.onWriteError(async () => {
        log.push('hook1');
      });
      lock.onWriteError(async () => {
        log.push('hook2');
      });

      try {
        await lock.write(async () => {
          throw new Error('fail');
        });
      } catch {
        // expected
      }

      expect(log).to.deep.equal(['hook1', 'hook2']);
    });
  });

  describe('@read and @write decorators', () => {
    it('should wrap methods with read lock', async () => {
      const lock = new RWLock();

      class TestCmd {
        project = { lock };

        @read
        async doRead(): Promise<string> {
          return 'read-result';
        }
      }

      const cmd = new TestCmd();
      const result = await cmd.doRead();
      expect(result).to.equal('read-result');
    });

    it('should wrap methods with write lock', async () => {
      const lock = new RWLock();
      const log: string[] = [];

      lock.onAfterWrite(async () => {
        log.push('hook');
      });

      class TestCmd {
        project = { lock };

        @write()
        async doWrite(): Promise<void> {
          log.push('write');
        }
      }

      const cmd = new TestCmd();
      await cmd.doWrite();
      expect(log).to.deep.equal(['write', 'hook']);
    });

    it('should set commit message from factory', async () => {
      const lock = new RWLock();
      let capturedMessage: string | undefined;

      lock.onAfterWrite(async () => {
        capturedMessage = getCommitContext().message;
      });

      class TestCmd {
        project = { lock };

        @write((n: string) => `Create thing ${n}`)
        async createThing(_name: string): Promise<void> {}
      }

      const cmd = new TestCmd();
      await cmd.createThing('foo');
      expect(capturedMessage).to.equal('Create thing foo');
    });

    it('should pass all args to the factory', async () => {
      const lock = new RWLock();
      let capturedMessage: string | undefined;

      lock.onAfterWrite(async () => {
        capturedMessage = getCommitContext().message;
      });

      class TestCmd {
        project = { lock };

        @write((src: string, dst: string) => `Move ${src} to ${dst}`)
        async move(_src: string, _dst: string): Promise<void> {}
      }

      const cmd = new TestCmd();
      await cmd.move('a', 'b');
      expect(capturedMessage).to.equal('Move a to b');
    });

    it('should not override an already-set commit message', async () => {
      const lock = new RWLock();
      let capturedMessage: string | undefined;

      lock.onAfterWrite(async () => {
        capturedMessage = getCommitContext().message;
      });

      class TestCmd {
        project = { lock };

        @write(() => 'inner message')
        async inner(): Promise<void> {}

        @write(() => 'outer message')
        async outer(): Promise<void> {
          await this.inner();
        }
      }

      const cmd = new TestCmd();
      await cmd.outer();
      expect(capturedMessage).to.equal('outer message');
    });

    it('should serialize decorated writes', async () => {
      const lock = new RWLock();
      const log: string[] = [];

      const entered = deferred();
      const proceed = deferred();

      class TestCmd {
        project = { lock };

        @write()
        async slowWrite(): Promise<void> {
          log.push('slow-start');
          entered.resolve();
          await proceed.promise;
          log.push('slow-end');
        }

        @write()
        async fastWrite(): Promise<void> {
          log.push('fast-start');
          log.push('fast-end');
        }
      }

      const cmd = new TestCmd();
      const p1 = cmd.slowWrite();

      await entered.promise;

      const p2 = cmd.fastWrite();
      proceed.resolve();
      await Promise.all([p1, p2]);

      expect(log.indexOf('slow-end')).to.be.lessThan(log.indexOf('fast-start'));
    });
  });
});
