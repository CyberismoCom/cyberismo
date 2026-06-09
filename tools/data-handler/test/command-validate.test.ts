// testing
import { expect, it, describe, vi } from 'vitest';

// node
import { join } from 'node:path';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

// cyberismo
import { copyDir } from '../src/utils/file-utils.js';
import { Cmd, Commands } from '../src/command-handler.js';

const commandHandler: Commands = new Commands();

// validation tests do not modify the content - so they can use the original files
const baseDir = process.cwd();
const testDir = join(baseDir, 'test/test-data');

describe('command-handler: validate command', () => {
  it('missing path', async () => {
    vi.spyOn(commandHandler, 'setProjectPath').mockResolvedValueOnce('path');

    await expect(commandHandler.command(Cmd.validate, [], {})).resolves.toEqual(
      {
        message: "Input validation error: cannot find project ''",
        statusCode: 400,
      },
    );
  });
  it('valid schema', async () => {
    const result = await commandHandler.command(Cmd.validate, [], {
      projectPath: join(testDir, 'valid/decision-records'),
    });
    expect(result.statusCode).toBe(200);
  });
  it('workflow with duplicate transition names fails validation', async () => {
    // Workflow create/update rejects duplicate transition names; a hand-edited
    // or pre-existing workflow file must be caught by project validation.
    const tmpDir = join(baseDir, 'tmp-command-validate-tests');
    mkdirSync(tmpDir, { recursive: true });
    try {
      await copyDir(join(testDir, 'valid/decision-records'), tmpDir);
      const workflowPath = join(tmpDir, '.cards/local/workflows/decision.json');
      const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      workflow.transitions.push(
        { name: 'Branch', fromState: ['Approved'], toState: 'Rejected' },
        { name: 'Branch', fromState: ['Draft'], toState: 'Rejected' },
      );
      writeFileSync(workflowPath, JSON.stringify(workflow));

      // Validate reports errors in the message with status 200.
      const result = await commandHandler.command(Cmd.validate, [], {
        projectPath: tmpDir,
      });
      expect(result.statusCode).toBe(200);
      expect(result.message).toContain(
        "has several transitions named 'Branch'; transition names must be unique",
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
