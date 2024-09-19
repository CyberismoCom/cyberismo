// testing
import { expect } from 'chai';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// cyberismo
import { copyDir } from '../src/utils/file-utils.js';
import { CardsOptions, Cmd, Commands } from '../src/command-handler.js';
import { errorFunction } from '../src/utils/log-utils.js';

// Create test artifacts in a temp folder.
const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-command-handler-rename-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const commandHandler: Commands = new Commands();
const options: CardsOptions = { projectPath: decisionRecordsPath };

describe('rename command', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('rename project (success)', async () => {
    const newName = 'decrec';
    const result = await commandHandler.command(Cmd.rename, [newName], options);
    expect(result.statusCode).to.equal(200);
  });
  it('rename project - no cards at all (success)', async () => {
    const minimalPath = join(testDir, 'valid/minimal');
    const optionsMini: CardsOptions = { projectPath: minimalPath };
    const newName = 'empty';
    const result = await commandHandler.command(
      Cmd.rename,
      [newName],
      optionsMini,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('try to rename project - path missing or invalid', async () => {
    const invalidProject = { projectPath: 'idontexist' };
    const newName = 'decrec';
    const result = await commandHandler.command(
      Cmd.rename,
      [newName],
      invalidProject,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('try to rename project - "to" missing', async () => {
    const newName = '';
    await commandHandler
      .command(Cmd.rename, [newName], options)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          "Input validation error: empty 'to' is not allowed",
        ),
      );
  });
  it('try to rename project - invalid "to" ', async () => {
    const newName = 'decrec_2';
    const result = await commandHandler.command(Cmd.rename, [newName], options);
    expect(result.statusCode).to.equal(400);
  });
});