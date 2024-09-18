// testing
import { assert, expect } from 'chai';

// node
import { join } from 'node:path';

// cyberismo
import { Cmd, Commands } from '../src/command-handler.js';
import { requestStatus } from '../src/interfaces/request-status-interfaces.js';

const commandHandler: Commands = new Commands();

// validation tests do not modify the content - so they can use the original files
const baseDir = process.cwd();
const testDir = join(baseDir, 'test/test-data');

describe('command-handler: validate command', () => {
  it('missing path', async () => {
    let result: requestStatus = { statusCode: 500 };
    try {
      result = await commandHandler.command(Cmd.validate, [], {});
      assert(false, 'this should not be reached as the above throws');
    } catch (error) {
      if (error instanceof Error) {
        // this block is here for linter
      }
    }
    expect(result.statusCode).to.equal(500);
  });
  it('valid schema', async () => {
    const result = await commandHandler.command(Cmd.validate, [], {
      projectPath: join(testDir, 'valid/decision-records'),
    });
    expect(result.statusCode).to.equal(200);
  });
});
