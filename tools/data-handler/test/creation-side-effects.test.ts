// testing
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// cyberismo
import { Cmd } from '../src/command-handler.js';
import { CommandManager } from '../src/command-manager.js';
import { copyDir } from '../src/utils/file-utils.js';
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

// The Create commands own the creation query and its side effects: once per
// created batch, after the batch's facts have been projected.
describe('creation query batching', () => {
  const batchingDir = join(testDir, 'batching');
  let commands: CommandManager;

  beforeAll(async () => {
    mkdirSync(batchingDir, { recursive: true });
    await copyDir('test/test-data', batchingDir);
    commands = new CommandManager(
      join(batchingDir, 'valid', 'decision-records'),
      {},
    );
    await commands.initialize();
  });

  it('runs the creation query once for a batch of instantiated cards', async () => {
    const spy = vi.spyOn(commands.project.calculationEngine, 'creationQuery');

    // The simplepage template holds two cards, so this is a real batch.
    const created = await commands.createCmd.createCard(
      'decision/templates/simplepage',
      undefined,
    );

    expect(created.length).toBeGreaterThan(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect([...spy.mock.calls[0][0]].sort()).toEqual(
      created.map((card) => card.key).sort(),
    );
    spy.mockRestore();
  });

  it('runs the creation query once for a batch of added template cards', async () => {
    const spy = vi.spyOn(commands.project.calculationEngine, 'creationQuery');

    const added = await commands.createCmd.addCards(
      'decision/cardTypes/decision',
      'decision/templates/decision',
      undefined,
      3,
    );

    expect(added).toHaveLength(3);
    expect(spy).toHaveBeenCalledTimes(1);
    expect([...spy.mock.calls[0][0]].sort()).toEqual([...added].sort());
    spy.mockRestore();
  });
});
