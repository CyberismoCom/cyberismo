// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { expect, it, describe } from 'vitest';
import {
  runWithCommitContext,
  getCommitContext,
} from '../../../src/infra/tx/commit-context.js';
import { deferred } from '../../test-utils.js';

describe('commit-context', () => {
  describe('runWithCommitContext + getCommitContext', () => {
    it('should return empty context outside runWithCommitContext', () => {
      const result = getCommitContext();
      expect(result).toEqual({});
    });

    it('should return the message inside context', async () => {
      await runWithCommitContext({ message: 'Test commit' }, async () => {
        const result = getCommitContext();
        expect(result.message).toBe('Test commit');
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
      const aliceGate = deferred();
      const bobGate = deferred();
      let aliceCtx: ReturnType<typeof getCommitContext>;
      let bobCtx: ReturnType<typeof getCommitContext>;

      const aliceRun = runWithCommitContext(
        { message: 'Alice msg' },
        async () => {
          await bobGate.promise; // wait until bob's context is active
          aliceCtx = getCommitContext();
          aliceGate.resolve();
        },
      );

      const bobRun = runWithCommitContext({ message: 'Bob msg' }, async () => {
        bobCtx = getCommitContext();
        bobGate.resolve(); // unblock alice
        await aliceGate.promise; // keep bob's context alive while alice reads
      });

      await Promise.all([aliceRun, bobRun]);

      expect(aliceCtx!.message).toBe('Alice msg');
      expect(bobCtx!.message).toBe('Bob msg');
    });
  });
});
