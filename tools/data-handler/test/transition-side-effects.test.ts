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
});
