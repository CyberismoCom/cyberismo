// testing
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// node
import { appendFile } from 'node:fs/promises';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// cyberismo
import { copyDir } from '../src/utils/file-utils.js';
import { Cmd, Commands } from '../src/command-handler.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-module-side-effects-tests');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');
const options = { projectPath: minimalPath };

// A module declares side effects as generic rules keyed on card types —
// module authors do not know the host project's card keys. Here: approving
// any simplepage card rejects every decision card still in Draft.
const sideEffectRule = `
onTransitionExecuteTransition(Card, "Approve", Other, "Reject") :-
    field(Card, "cardType", "decision/cardTypes/simplepage"),
    field(Other, "cardType", "decision/cardTypes/decision"),
    field(Other, "workflowState", "Draft").
`;

describe('module-provided transition side effects', () => {
  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
    await appendFile(
      join(
        decisionRecordsPath,
        '.cards/local/calculations/test/calculation.lp',
      ),
      sideEffectRule,
    );
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('executes a side effect declared by an imported module', async () => {
    const commands = new Commands();

    let result = await commands.command(
      Cmd.import,
      ['module', decisionRecordsPath],
      options,
    );
    expect(result.statusCode).toBe(200);

    result = await commands.command(
      Cmd.create,
      ['card', 'decision/templates/decision'],
      options,
    );
    expect(result.statusCode).toBe(200);
    const decisionCard = result.affectsCards![0];

    result = await commands.command(
      Cmd.create,
      ['card', 'decision/templates/simplepage'],
      options,
    );
    expect(result.statusCode).toBe(200);
    const simplepageCard = result.affectsCards![0];

    result = await commands.command(
      Cmd.transition,
      [simplepageCard, 'Approve'],
      options,
    );
    expect(result.statusCode).toBe(200);

    const shown = await commands.command(
      Cmd.show,
      ['card', decisionCard],
      options,
    );
    const card = shown.payload as { metadata?: { workflowState?: string } };
    expect(card.metadata?.workflowState).toBe('Rejected');
  });
});
