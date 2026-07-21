// testing
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// cyberismo
import { Cmd } from '../src/command-handler.js';
import {
  cardState,
  setupSideEffectProject,
} from './helpers/side-effect-fixture.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-creation-side-effects-tests');

beforeAll(() => {
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('creation side effects', () => {
  it('executes side effects declared for card creation', async () => {
    // Any created card of the decision card type rejects decision_6.
    const { commands, options } = await setupSideEffectProject(
      testDir,
      'creation',
      'onTransitionExecuteTransition(Card, "Create", decision_6, "Reject") :- field(Card, "cardType", "decision/cardTypes/decision").',
    );
    const result = await commands.command(
      Cmd.create,
      ['card', 'decision/templates/decision'],
      options,
    );
    expect(result.statusCode).toBe(200);
    expect(await cardState(commands, options, 'decision_6')).toBe('Rejected');
  });
});
