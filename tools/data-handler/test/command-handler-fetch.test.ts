// testing
import { expect } from 'chai';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// cyberismo
import { type CardsOptions, Cmd, Commands } from '../src/command-handler.js';
import { copyDir } from '../src/utils/file-utils.js';

// Create test artifacts in a temp folder.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-command-handler-fetch-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');

const commandHandler: Commands = new Commands();
const options: CardsOptions = { projectPath: decisionRecordsPath };

describe('fetch command', () => {
  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('fetch hubs (success)', async () => {
    const result = await commandHandler.command(Cmd.fetch, ['hubs'], options);
    expect(result.statusCode).to.equal(200);
  });
  it('try to fetch incorrect type', async () => {
    const result = await commandHandler.command(
      Cmd.fetch,
      ['unknown'],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });
});
