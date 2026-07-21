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
const testDir = join(baseDir, 'tmp-transition-side-effects-tests');

const setup = (name: string, facts: string) =>
  setupSideEffectProject(testDir, name, facts);
const state = cardState;

beforeAll(() => {
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('transition side effects', () => {
  it('performs the declared side-effect transition on another card', async () => {
    const { commands, options } = await setup(
      'single',
      'onTransitionExecuteTransition(decision_5, "Approve", decision_6, "Reject").',
    );
    const result = await commands.command(
      Cmd.transition,
      ['decision_5', 'Approve'],
      options,
    );
    expect(result.statusCode).toBe(200);
    expect(await state(commands, options, 'decision_5')).toBe('Approved');
    expect(await state(commands, options, 'decision_6')).toBe('Rejected');
  });
});
