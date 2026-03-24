import { expect, it, describe } from 'vitest';
import {
  runWithCommitContext,
  getCommitContext,
} from '../src/utils/commit-context.js';
import { deferred } from './test-utils.js';

describe('commit-context', () => {
  describe('runWithCommitContext + getCommitContext', () => {
    it('should return empty context outside runWithCommitContext', () => {
      const result = getCommitContext();
      expect(result).toEqual({});
    });

    it('should return the author inside context', async () => {
      const author = { name: 'Alice', email: 'alice@example.com' };
      await runWithCommitContext({ author }, async () => {
        const result = getCommitContext();
        expect(result.author).toEqual(author);
      });
    });

    it('should return the message inside context', async () => {
      await runWithCommitContext({ message: 'Test commit' }, async () => {
        const result = getCommitContext();
        expect(result.message).toBe('Test commit');
      });
    });

    it('should merge author and message from nested calls', async () => {
      const author = { name: 'Alice', email: 'alice@example.com' };
      await runWithCommitContext({ author }, async () => {
        await runWithCommitContext({ message: 'Inner message' }, async () => {
          const result = getCommitContext();
          expect(result.author).toEqual(author);
          expect(result.message).toBe('Inner message');
        });
      });
    });

    it('should return the value from the inner function', async () => {
      const result = await runWithCommitContext(
        { message: 'msg' },
        async () => 42,
      );
      expect(result).toBe(42);
    });

    it('should isolate concurrent calls', async () => {
      const alice = { name: 'Alice', email: 'alice@example.com' };
      const bob = { name: 'Bob', email: 'bob@example.com' };

      const aliceGate = deferred();
      const bobGate = deferred();
      let aliceCtx: ReturnType<typeof getCommitContext>;
      let bobCtx: ReturnType<typeof getCommitContext>;

      const aliceRun = runWithCommitContext(
        { author: alice, message: 'Alice msg' },
        async () => {
          await bobGate.promise; // wait until bob's context is active
          aliceCtx = getCommitContext();
          aliceGate.resolve();
        },
      );

      const bobRun = runWithCommitContext(
        { author: bob, message: 'Bob msg' },
        async () => {
          bobCtx = getCommitContext();
          bobGate.resolve(); // unblock alice
          await aliceGate.promise; // keep bob's context alive while alice reads
        },
      );

      await Promise.all([aliceRun, bobRun]);

      expect(aliceCtx!.author).toEqual(alice);
      expect(aliceCtx!.message).toBe('Alice msg');
      expect(bobCtx!.author).toEqual(bob);
      expect(bobCtx!.message).toBe('Bob msg');
    });
  });
});
