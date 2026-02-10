import { expect } from 'chai';

import { RWLock, read, write } from '../src/utils/rw-lock.js';

// Helper to create a delay
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

      const r1 = lock.read(async () => {
        log.push('r1-start');
        await delay(50);
        log.push('r1-end');
      });

      const r2 = lock.read(async () => {
        log.push('r2-start');
        await delay(50);
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

      const w1 = lock.write(async () => {
        log.push('w1-start');
        await delay(50);
        log.push('w1-end');
      });

      // Give the write a moment to acquire
      await delay(5);

      const r1 = lock.read(async () => {
        log.push('r1-start');
        await delay(10);
        log.push('r1-end');
      });

      await Promise.all([w1, r1]);

      // Read should start only after write ends
      expect(log.indexOf('w1-end')).to.be.lessThan(log.indexOf('r1-start'));
    });

    it('should block other writes while writing', async () => {
      const lock = new RWLock();
      const log: string[] = [];

      const w1 = lock.write(async () => {
        log.push('w1-start');
        await delay(50);
        log.push('w1-end');
      });

      // Give the write a moment to acquire
      await delay(5);

      const w2 = lock.write(async () => {
        log.push('w2-start');
        await delay(10);
        log.push('w2-end');
      });

      await Promise.all([w1, w2]);

      // Second write should start only after first write ends
      expect(log.indexOf('w1-end')).to.be.lessThan(log.indexOf('w2-start'));
    });

    it('should block writes while reading', async () => {
      const lock = new RWLock();
      const log: string[] = [];

      const r1 = lock.read(async () => {
        log.push('r1-start');
        await delay(50);
        log.push('r1-end');
      });

      // Give the read a moment to acquire
      await delay(5);

      const w1 = lock.write(async () => {
        log.push('w1-start');
        await delay(10);
        log.push('w1-end');
      });

      await Promise.all([r1, w1]);

      // Write should start only after read ends
      expect(log.indexOf('r1-end')).to.be.lessThan(log.indexOf('w1-start'));
    });
  });

  describe('writer priority', () => {
    it('should prioritize waiting writers over new readers', async () => {
      const lock = new RWLock();
      const log: string[] = [];

      // Start a read to hold the lock
      const r1 = lock.read(async () => {
        log.push('r1-start');
        await delay(50);
        log.push('r1-end');
      });

      // Give the read time to acquire
      await delay(5);

      // Queue a writer — it should wait for r1 to finish
      const w1 = lock.write(async () => {
        log.push('w1-start');
        await delay(10);
        log.push('w1-end');
      });

      // Queue another reader — it should wait for the writer
      await delay(5);
      const r2 = lock.read(async () => {
        log.push('r2-start');
        log.push('r2-end');
      });

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

    it('should not treat leaked async continuations as reentrant', async () => {
      const lock = new RWLock();
      const log: string[] = [];

      // Resolve function that will be called from inside the write scope
      let leakedResolve!: () => void;
      const leakedPromise = new Promise<void>((r) => {
        leakedResolve = r;
      });

      await lock.write(async () => {
        // Schedule work that will run after the lock is released.
        // It inherits the ALS context but should NOT skip locking if it was released.
        setTimeout(async () => {
          await lock.write(async () => {
            log.push('leaked-start');
            await delay(30);
            log.push('leaked-end');
          });
          leakedResolve();
        }, 10);

        log.push('w1');
      });

      // Start another write that should serialize with the leaked one
      const w2 = lock.write(async () => {
        log.push('w2-start');
        await delay(30);
        log.push('w2-end');
      });

      await Promise.all([w2, leakedPromise]);

      // The two writes must not overlap
      if (log.indexOf('w2-start') < log.indexOf('leaked-start')) {
        expect(log.indexOf('w2-end')).to.be.lessThan(
          log.indexOf('leaked-start'),
        );
      } else {
        expect(log.indexOf('leaked-end')).to.be.lessThan(
          log.indexOf('w2-start'),
        );
      }
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

        @write
        async doWrite(): Promise<void> {
          log.push('write');
        }
      }

      const cmd = new TestCmd();
      await cmd.doWrite();
      expect(log).to.deep.equal(['write', 'hook']);
    });

    it('should serialize decorated writes', async () => {
      const lock = new RWLock();
      const log: string[] = [];

      class TestCmd {
        project = { lock };

        @write
        async slowWrite(): Promise<void> {
          log.push('slow-start');
          await delay(50);
          log.push('slow-end');
        }

        @write
        async fastWrite(): Promise<void> {
          log.push('fast-start');
          log.push('fast-end');
        }
      }

      const cmd = new TestCmd();
      const p1 = cmd.slowWrite();
      await delay(5);
      const p2 = cmd.fastWrite();
      await Promise.all([p1, p2]);

      expect(log.indexOf('slow-end')).to.be.lessThan(log.indexOf('fast-start'));
    });
  });
});
