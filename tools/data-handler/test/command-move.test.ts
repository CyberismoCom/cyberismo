// testing
import { expect } from 'chai';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';

// cyberismo
import { Cmd, Commands } from '../src/command-handler.js';
import { copyDir } from '../src/utils/file-utils.js';
import { Project } from '../src/containers/project.js';
import { Show } from '../src/commands/index.js';

// Create test artifacts in a temp folder.
const baseDir = import.meta.dirname;
const commandHandler: Commands = new Commands();

describe('move command', () => {
  let testDir: string;
  let decisionRecordsPath: string;
  let options: { projectPath: string };
  let createdCardKey: string;

  beforeEach(async () => {
    testDir = join(baseDir, `tmp-command-handler-move-tests`);
    decisionRecordsPath = join(testDir, 'valid/decision-records');
    options = { projectPath: decisionRecordsPath };

    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);

    // Create few more cards to play with (moved from first test)
    const template = 'decision/templates/decision';
    const parent = '';
    const done = await commandHandler.command(
      Cmd.create,
      ['card', template, parent],
      options,
    );
    if (done.statusCode !== 200) {
      throw new Error(`Failed to create test card: ${done.message}`);
    }

    // Store the created card key for use in tests
    createdCardKey = done.affectsCards?.[0] || '';
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('move card to root (success)', async () => {
    const project = new Project(options.projectPath!);
    await project.populateCaches();
    const cards = new Show(project).showProjectCards();

    // Use the card created in beforeEach
    const sourceId = cards[cards.length - 1].key;
    const destination = 'root';
    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      options,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('move card to another card (success)', async () => {
    const project = new Project(options.projectPath!);
    await project.populateCaches();
    const cards = new Show(project).showProjectCards();
    expect(cards.length).to.be.greaterThanOrEqual(2);

    const sourceId = cards[cards.length - 1].key;
    const destination = cards[cards.length - 2].key;
    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      options,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('move child card to another card (success)', async () => {
    const sourceId = 'decision_6';
    const destination = createdCardKey;

    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      options,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('try to move card to itself', async () => {
    const sourceId = 'decision_6';
    const destination = 'decision_6';
    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('try to move card to inside itself', async () => {
    // create two root-level cards
    const template = 'decision/templates/decision';
    const parent = '';
    let done = await commandHandler.command(
      Cmd.create,
      ['card', template, parent],
      options,
    );
    const card1 = done.affectsCards?.at(0);
    done = await commandHandler.command(
      Cmd.create,
      ['card', template, parent],
      options,
    );
    const card2 = done.affectsCards?.at(0);

    if (card1 && card2) {
      // Move card2 to be under card1
      let result = await commandHandler.command(
        Cmd.move,
        [card1, card2],
        options,
      );
      expect(result.statusCode).to.equal(200);

      // Try to move card1 under card2
      result = await commandHandler.command(Cmd.move, [card2, card1], options);
      expect(result.statusCode).to.equal(400);
    } else {
      expect(false);
    }
  });
  it('try to move card - project missing', async () => {
    const sourceId = 'decision_11';
    const destination = 'decision_12';
    const invalidProject = { projectPath: 'idontexist' };
    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      invalidProject,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('try to move card - source card not found', async () => {
    const sourceId = 'decision_999';
    const destination = 'decision_11';
    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('try to move card - destination card not found', async () => {
    const sourceId = 'decision_11';
    const destination = 'decision_999';
    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('move card from template to template', async () => {
    const sourceId = 'decision_2';
    const destination = 'decision_3';
    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      options,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('try to move card from template to project', async () => {
    const sourceId = 'decision_3';
    const destination = 'decision_6';
    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('try to move card from project to template', async () => {
    const sourceId = 'decision_6';
    const destination = 'decision_3';
    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });

  it('verify card cache after move operation', async () => {
    // First establish the command handler's project instance by running a command
    await commandHandler.command(Cmd.show, ['project'], options);

    // Get the CommandManager instance to access its project
    const { CommandManager } = await import('../src/command-manager.js');
    const commandManager = await CommandManager.getInstance(
      options.projectPath!,
    );
    const project = commandManager.project;

    // Create two cards - parent and child
    const template = 'decision/templates/decision';
    let result = await commandHandler.command(
      Cmd.create,
      ['card', template, ''],
      options,
    );
    const parentCardKey = result.affectsCards?.[0];
    expect(parentCardKey).to.be.a('string');

    result = await commandHandler.command(
      Cmd.create,
      ['card', template, ''],
      options,
    );
    const childCardKey = result.affectsCards?.[0];
    expect(childCardKey).to.be.a('string');

    // Verify initial state - both cards should be findable in the same project instance used by commandHandler
    const parentBefore = project.findCard(parentCardKey!);
    const childBefore = project.findCard(childCardKey!);
    const allCardsBefore = project.cards(undefined);

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    expect(parentBefore, 'Parent card should be findable after creation').to.not
      .be.undefined;
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    expect(childBefore, 'Child card should be findable after creation').to.not
      .be.undefined;
    expect(childBefore!.parent).to.equal('root'); // Should be at root initially
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    expect(
      allCardsBefore.some((c) => c.key === childCardKey),
      'Child should be found in project.cards() result',
    ).to.be.true;

    // Move child under parent
    result = await commandHandler.command(
      Cmd.move,
      [childCardKey!, parentCardKey!],
      options,
    );
    expect(result.statusCode).to.equal(200);

    // Verify state after move
    const parentAfter = project.findCard(parentCardKey!);
    const childAfter = project.findCard(childCardKey!);
    const allCardsAfter = project.cards(undefined);

    // Verify expectations
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    expect(childAfter, 'Child card should still be findable after move').to.not
      .be.undefined;
    expect(
      childAfter!.parent,
      'Child card should have correct parent',
    ).to.equal(parentCardKey);
    expect(childAfter!.path, 'Child card should have correct path').to.include(
      `${parentCardKey}${sep}c${sep}${childCardKey}`,
    );
    expect(
      parentAfter!.children,
      'Parent should list child in children array',
    ).to.include(childCardKey);
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    expect(
      allCardsAfter.some((c) => c.key === childCardKey),
      'Child should be found in project.cards() result after move',
    ).to.be.true;
  });
});
