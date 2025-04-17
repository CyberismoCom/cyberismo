import { expect } from 'chai';
import { dirname, join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { copyDir, pathExists } from '../src/utils/file-utils.js';
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
    commands = await CommandManager.getInstance(decisionRecordsPath);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('Remove - remove card that has children', async () => {
    const calcDir = join(decisionRecordsPath, '.calc');
    const cardTreeCalcFile = join(calcDir, 'cardTree.lp');
    let cardTreeFileContent = (await readFile(cardTreeCalcFile)).toString();
    const cardsCalcFile = join(calcDir, 'cards', 'decision_5.lp');
    expect(pathExists(cardsCalcFile)).to.equal(true);
    expect(cardTreeFileContent.includes('cards/decision_5.lp')).to.equal(true);

    const cardId = 'decision_5';
    const removeCmd = new Remove(commands.project, commands.calculateCmd);
    await removeCmd
      .remove('card', cardId)
      .then(() => {
        expect(true);
      })
      .catch(() => {
        expect(false);
      });

    // After deleting the card, check that calculations files are correctly updated.
    cardTreeFileContent = (await readFile(cardTreeCalcFile)).toString();
    expect(cardTreeFileContent.includes('cards/decision_5.lp')).to.equal(false);
    // Since decision_6 is decision_5's child, it should have been removed as well.
    expect(cardTreeFileContent.includes('cards/decision_6.lp')).to.equal(false);
    expect(pathExists(cardsCalcFile)).to.equal(false);
  });
});
