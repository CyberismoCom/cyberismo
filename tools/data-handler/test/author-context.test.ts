import { expect } from 'chai';
import { runWithAuthor, getAuthor } from '../src/utils/author-context.js';
import { deferred } from './test-utils.js';

describe('author-context', () => {
  describe('runWithAuthor + getAuthor', () => {
    it('should return the author inside runWithAuthor', async () => {
      const author = { name: 'Alice', email: 'alice@example.com' };
      await runWithAuthor(author, async () => {
        const result = getAuthor();
        expect(result).to.deep.equal(author);
      });
    });

    it('should return undefined outside runWithAuthor', () => {
      const result = getAuthor();
      expect(result).to.equal(undefined);
    });

    it('should isolate concurrent calls', async () => {
      const alice = { name: 'Alice', email: 'alice@example.com' };
      const bob = { name: 'Bob', email: 'bob@example.com' };

      const aliceGate = deferred();
      const bobGate = deferred();
      let aliceAuthor: ReturnType<typeof getAuthor>;
      let bobAuthor: ReturnType<typeof getAuthor>;

      const aliceRun = runWithAuthor(alice, async () => {
        await bobGate.promise; // wait until bob's context is active
        aliceAuthor = getAuthor();
        aliceGate.resolve();
      });

      const bobRun = runWithAuthor(bob, async () => {
        bobAuthor = getAuthor();
        bobGate.resolve(); // unblock alice
        await aliceGate.promise; // keep bob's context alive while alice reads
      });

      await Promise.all([aliceRun, bobRun]);

      expect(aliceAuthor!).to.deep.equal(alice);
      expect(bobAuthor!).to.deep.equal(bob);
    });

    it('should return the value from the inner function', async () => {
      const author = { name: 'Alice', email: 'alice@example.com' };
      const result = await runWithAuthor(author, async () => {
        return 42;
      });
      expect(result).to.equal(42);
    });
  });
});
