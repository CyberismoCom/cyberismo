// testing
import { expect } from 'chai';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// cyberismo
import { CardsOptions, Cmd, Commands } from '../src/command-handler.js';
import { copyDir } from '../src/utils/file-utils.js';

// Create test artifacts in a temp folder.
const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-command-handler-add-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');

const commandHandler: Commands = new Commands();
const options: CardsOptions = { projectPath: decisionRecordsPath };

describe('add command', () => {
  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('add template card (success)', async () => {
    const result = await commandHandler.command(
      Cmd.add,
      ['decision/templates/decision', 'decision/cardTypes/decision'],
      options,
    );
    expect(result.statusCode).to.equal(200);

    // Check that the added card received a rank.
    if (result.affectsCards?.at(0)) {
      const addedCard = result.affectsCards?.at(0) || '';
      const showResult = await commandHandler.command(
        Cmd.show,
        ['card', addedCard],
        options,
      );
      if (showResult.statusCode === 200) {
        const newRank = Object(showResult.payload)['metadata']['rank'];
        expect(newRank).not.to.equal('');
        expect(newRank).not.to.equal(undefined);
      }
    }
  });
  it('add template card to under a parent (success)', async () => {
    const result = await commandHandler.command(
      Cmd.add,
      [
        'decision/templates/decision',
        'decision/cardTypes/decision',
        'decision_1',
      ],
      options,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('try to add template card to non-existent template', async () => {
    const result = await commandHandler.command(
      Cmd.add,
      ['decision/templates/idontexists', 'decision/cardTypes/decision'],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('try to add template card to non-existent template parent card', async () => {
    const result = await commandHandler.command(
      Cmd.add,
      [
        'decision/templates/decision',
        'decision/cardTypes/decision',
        'decision_999',
      ],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('try to add template card with invalid path', async () => {
    const result = await commandHandler.command(
      Cmd.add,
      ['decision/templates/decision', 'decision/cardTypes/decision'],
      { projectPath: 'random-path' },
    );
    expect(result.statusCode).to.equal(400);
  });
  it('try to add card with invalid "repeat" value', async () => {
    options.repeat = -1;
    const result = await commandHandler.command(
      Cmd.add,
      ['decision/templates/decision', 'decision/cardTypes/decision'],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });
});
// todo: no test case with valid repeat number
