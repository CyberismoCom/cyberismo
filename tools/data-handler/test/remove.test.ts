import { expect } from 'chai';
import { dirname, join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import { copyDir } from '../src/utils/file-utils.js';
import { CommandManager } from '../src/command-manager.js';
import { Remove } from '../src/commands/remove.js';

import { fileURLToPath } from 'node:url';

describe('remove card', () => {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const testDir = join(baseDir, 'tmp-remove-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    commands = new CommandManager(decisionRecordsPath);
    await commands.project.calculationEngine.generate();
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('Remove - remove card that has children', async () => {
    const cardId = 'decision_5';
    const removeCmd = new Remove(commands.project);
    await removeCmd.remove('card', cardId);

    const card = await commands.project.findSpecificCard(cardId);
    expect(card).to.equal(undefined);
    // Since decision_6 is decision_5's child, it should have been removed as well.
    const card6 = await commands.project.findSpecificCard('decision_6');
    expect(card6).to.equal(undefined);
  });
});
