// testing
import { expect } from 'chai';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// cyberismo
import { CardsOptions, Cmd, Commands } from '../src/command-handler.js';
import { Project } from '../src/containers/project.js';
import { Show } from '../src/show.js';
import { copyDir } from '../src/utils/file-utils.js';

// Create test artifacts in a temp folder.
const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-command-handler-move-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');

const commandHandler: Commands = new Commands();
const options: CardsOptions = { projectPath: decisionRecordsPath };

describe('move command', () => {
  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('move card to root (success)', async () => {
    // Create few more cards to play with.
    const template = 'decision/templates/decision';
    const parent = '';
    const done = await commandHandler.command(
      Cmd.create,
      ['card', template, parent],
      options,
    );
    expect(done.statusCode).to.equal(200);

    const sourceId = done.affectsCards![0];
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
    const cards = await new Show(project).showProjectCards();
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
    const project = new Project(options.projectPath!);
    const cards = await new Show(project).showProjectCards();

    const sourceId = 'decision_6';
    const destination = cards[cards.length - 1].key;
    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      options,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('move card - project missing', async () => {
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
  it('move card - source card not found', async () => {
    const sourceId = 'decision_999';
    const destination = 'decision_11';
    const result = await commandHandler.command(
      Cmd.move,
      [sourceId, destination],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('move card - destination card not found', async () => {
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
});
