// testing
import { assert, expect } from 'chai';
import * as sinon from 'sinon';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// cyberismo
import { copyDir } from '../src/utils/file-utils.js';
import { type CardsOptions, Cmd, Commands } from '../src/command-handler.js';
import { Project } from '../src/containers/project.js';
import { Calculate, Show } from '../src/commands/index.js';

// Create test artifacts in a temp folder.
const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-command-handler-transition-tests');
const decisionRecordsPath = join(testDir, 'valid/decision-records');

const commandHandler: Commands = new Commands();
const options: CardsOptions = { projectPath: decisionRecordsPath };

describe('transition command', () => {
  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('transition to new state - success()', async () => {
    const project = new Project(decisionRecordsPath);
    const calculate = new Calculate(project);
    const show = new Show(project, calculate);
    const card = await show.showCardDetails({ metadata: true }, 'decision_5');

    const result = await commandHandler.command(
      Cmd.transition,
      ['decision_5', 'Approve'],
      options,
    );

    expect(result.statusCode).to.equal(200);
    const card2 = await show.showCardDetails({ metadata: true }, 'decision_5');
    expect(card2.metadata?.lastTransitioned).to.not.equal(
      card.metadata?.lastTransitioned,
    );
    expect(card2.metadata?.lastUpdated).to.not.equal(
      card.metadata?.lastUpdated,
    );
  });
  it('transition to new state with multiple "fromStates" - success()', async () => {
    const result = await commandHandler.command(
      Cmd.transition,
      ['decision_6', 'Reject'],
      options,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('transition to new state with wildcard workflow transition - success()', async () => {
    const result = await commandHandler.command(
      Cmd.transition,
      ['decision_6', 'Reopen'],
      options,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('missing project', async () => {
    const stubProjectPath = sinon
      .stub(commandHandler, 'setProjectPath')
      .resolves('path');
    try {
      await commandHandler.command(
        Cmd.transition,
        ['decision_5', 'Created'],
        {},
      );
      assert(false, 'this should not be reached as the above throws');
    } catch {
      // missing path (if the project location cannot be deduced) throws
      expect(true);
    }
    stubProjectPath.restore();
  });
  it('missing card', async () => {
    const result = await commandHandler.command(
      Cmd.transition,
      ['', 'Create'],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('wrong state - no such state', async () => {
    const result = await commandHandler.command(
      Cmd.transition,
      ['decision_5', 'IDontExist'],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('wrong state - illegal transition', async () => {
    // cannot move from approved (earlier test moves state from create to approved) back to created
    const result = await commandHandler.command(
      Cmd.transition,
      ['decision_5', 'Create'],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('transition to same state', async () => {
    // an error is shown if card is already in a given state
    let result = await commandHandler.command(
      Cmd.transition,
      ['decision_6', 'Reject'],
      options,
    );
    expect(result.statusCode).to.equal(200);
    result = await commandHandler.command(
      Cmd.transition,
      ['decision_6', 'Reject'],
      options,
    );
    expect(result.statusCode).to.equal(200);
  });
});
