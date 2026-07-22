// testing
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// cyberismo
import { Cmd } from '../src/command-handler.js';
import { Project } from '../src/containers/project.js';
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

afterEach(() => {
  vi.restoreAllMocks();
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

  it('propagates a primary state-write failure instead of swallowing it', async () => {
    // Regression test: cardTransition used to .catch(console.error) around
    // the whole write+query chain, so a failed metadata write was silently
    // dropped and the command reported success anyway.
    const { commands, options } = await setup('write-failure', '% no facts');
    vi.spyOn(Project.prototype, 'updateCardMetadata').mockRejectedValueOnce(
      new Error('disk full'),
    );
    const result = await commands.command(
      Cmd.transition,
      ['decision_5', 'Approve'],
      options,
    );
    expect(result.statusCode).not.toBe(200);
  });

  it('cascades through a chain, allowing two different transitions on one card', async () => {
    const { commands, options } = await setup(
      'chain',
      [
        'onTransitionExecuteTransition(decision_5, "Approve", decision_6, "Reject").',
        'onTransitionExecuteTransition(decision_6, "Reject", decision_5, "Deprecate").',
      ].join('\n'),
    );
    const result = await commands.command(
      Cmd.transition,
      ['decision_5', 'Approve'],
      options,
    );
    expect(result.statusCode).toBe(200);
    // decision_5: Created -Approve-> Approved -Deprecate-> Deprecated
    expect(await state(commands, options, 'decision_5')).toBe('Deprecated');
    expect(await state(commands, options, 'decision_6')).toBe('Rejected');
  });

  it('terminates a mutual cycle: the repeated pair is skipped', async () => {
    const { commands, options } = await setup(
      'cycle-mutual',
      [
        'onTransitionExecuteTransition(decision_5, "Approve", decision_6, "Reject").',
        'onTransitionExecuteTransition(decision_6, "Reject", decision_5, "Approve").',
      ].join('\n'),
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

  it('terminates a self-loop: Reject is repeatable from Rejected but runs once', async () => {
    const { commands, options } = await setup(
      'cycle-self',
      'onTransitionExecuteTransition(decision_6, "Reject", decision_6, "Reject").',
    );
    const perform = vi.spyOn(Project.prototype, 'performTransition');
    const result = await commands.command(
      Cmd.transition,
      ['decision_6', 'Reject'],
      options,
    );
    expect(result.statusCode).toBe(200);
    expect(await state(commands, options, 'decision_6')).toBe('Rejected');
    // The self-loop side effect must be deduped by the visited set before
    // it's ever invoked, not executed and merely converged to the same state.
    expect(perform).toHaveBeenCalledTimes(1);
  });

  it('skips a side effect filtered out by transitionDenied', async () => {
    const { commands, options } = await setup(
      'denied',
      [
        'onTransitionExecuteTransition(decision_5, "Approve", decision_6, "Reject").',
        'transitionDenied(decision_6, "Reject", "side effect not allowed").',
      ].join('\n'),
    );
    const result = await commands.command(
      Cmd.transition,
      ['decision_5', 'Approve'],
      options,
    );
    expect(result.statusCode).toBe(200);
    expect(await state(commands, options, 'decision_5')).toBe('Approved');
    expect(await state(commands, options, 'decision_6')).toBe('Approved');
  });

  it('skips a side effect on a missing card', async () => {
    const { commands, options } = await setup(
      'missing-card',
      'onTransitionExecuteTransition(decision_5, "Approve", decision_99, "Reject").',
    );
    const result = await commands.command(
      Cmd.transition,
      ['decision_5', 'Approve'],
      options,
    );
    expect(result.statusCode).toBe(200);
    expect(await state(commands, options, 'decision_5')).toBe('Approved');
  });

  it('skips a side-effect transition not available from the current state', async () => {
    // decision_6 is Approved; its Approve transition is only available from Draft.
    const { commands, options } = await setup(
      'unavailable',
      'onTransitionExecuteTransition(decision_5, "Approve", decision_6, "Approve").',
    );
    const result = await commands.command(
      Cmd.transition,
      ['decision_5', 'Approve'],
      options,
    );
    expect(result.statusCode).toBe(200);
    expect(await state(commands, options, 'decision_5')).toBe('Approved');
    expect(await state(commands, options, 'decision_6')).toBe('Approved');
  });
});
