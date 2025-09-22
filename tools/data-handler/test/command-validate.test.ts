// testing
import { expect } from 'chai';
import * as sinon from 'sinon';

// node
import { join } from 'node:path';

// cyberismo
import { Cmd, Commands } from '../src/command-handler.js';

const commandHandler: Commands = new Commands();

// validation tests do not modify the content - so they can use the original files
const baseDir = process.cwd();
const testDir = join(baseDir, 'test/test-data');

describe('command-handler: validate command', () => {
  it('missing path', async () => {
    const stubProjectPath = sinon
      .stub(commandHandler, 'setProjectPath')
      .resolves('path');
    await expect(
      commandHandler.command(Cmd.validate, [], {}),
    ).to.eventually.deep.equal({
      message: "Input validation error: cannot find project ''",
      statusCode: 400,
    });
    stubProjectPath.restore();
  });
  it('valid schema', async () => {
    const result = await commandHandler.command(Cmd.validate, [], {
      projectPath: join(testDir, 'valid/decision-records'),
    });
    expect(result.statusCode).to.equal(200);
  });
});
