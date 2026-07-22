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
  it('override-enabled calculated field with stored value passes validation', async () => {
    // A calculated field marked enableOverride may legitimately carry a
    // user-provided value in index.json; it must not be flagged.
    const tmpDir = join(baseDir, 'tmp-command-validate-tests-override-valid');
    mkdirSync(tmpDir, { recursive: true });
    try {
      await copyDir(join(testDir, 'valid/decision-records'), tmpDir);
      const cardTypePath = join(tmpDir, '.cards/local/cardTypes/decision.json');
      const cardType = JSON.parse(readFileSync(cardTypePath, 'utf-8'));
      const obsoletedByField = cardType.customFields.find(
        (field: { name: string }) =>
          field.name === 'decision/fieldTypes/obsoletedBy',
      );
      expect(obsoletedByField).toBeDefined();
      obsoletedByField.enableOverride = true;
      writeFileSync(cardTypePath, JSON.stringify(cardType));

      const cardPath = join(
        tmpDir,
        'cardRoot/decision_5/c/decision_6/index.json',
      );
      const card = JSON.parse(readFileSync(cardPath, 'utf-8'));
      card['decision/fieldTypes/obsoletedBy'] = 'decision_999';
      writeFileSync(cardPath, JSON.stringify(card));

      const result = await commandHandler.command(Cmd.validate, [], {
        projectPath: tmpDir,
      });
      expect(result.statusCode).toBe(200);
      expect(result.message).toBe('Project structure validated');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
  it('calculated field with stored value but no enableOverride fails validation', async () => {
    // Without enableOverride, a stored value in a calculated field is still
    // disallowed, matching current behavior.
    const tmpDir = join(baseDir, 'tmp-command-validate-tests-override-none');
    mkdirSync(tmpDir, { recursive: true });
    try {
      await copyDir(join(testDir, 'valid/decision-records'), tmpDir);
      const cardPath = join(
        tmpDir,
        'cardRoot/decision_5/c/decision_6/index.json',
      );
      const card = JSON.parse(readFileSync(cardPath, 'utf-8'));
      card['decision/fieldTypes/obsoletedBy'] = 'decision_999';
      writeFileSync(cardPath, JSON.stringify(card));

      const result = await commandHandler.command(Cmd.validate, [], {
        projectPath: tmpDir,
      });
      expect(result.statusCode).toBe(200);
      expect(result.message).toContain(
        'not allowed to have a value in a calculated field',
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
  it('calculated field with null value passes validation', async () => {
    // Null is cleared-override residue and must always be tolerated,
    // regardless of enableOverride.
    const tmpDir = join(baseDir, 'tmp-command-validate-tests-override-null');
    mkdirSync(tmpDir, { recursive: true });
    try {
      await copyDir(join(testDir, 'valid/decision-records'), tmpDir);
      const cardPath = join(
        tmpDir,
        'cardRoot/decision_5/c/decision_6/index.json',
      );
      const card = JSON.parse(readFileSync(cardPath, 'utf-8'));
      card['decision/fieldTypes/obsoletedBy'] = null;
      writeFileSync(cardPath, JSON.stringify(card));

      const result = await commandHandler.command(Cmd.validate, [], {
        projectPath: tmpDir,
      });
      expect(result.statusCode).toBe(200);
      expect(result.message).toBe('Project structure validated');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
  it('override-enabled calculated field with invalid value fails type validation', async () => {
    // An override value must still be type-checked like any other value.
    // decision/fieldTypes/obsoletedBy is a shortText field (max 80 chars),
    // so a longer string should be rejected on type grounds, not because
    // it's a calculated field.
    const tmpDir = join(baseDir, 'tmp-command-validate-tests-override-bad');
    mkdirSync(tmpDir, { recursive: true });
    try {
      await copyDir(join(testDir, 'valid/decision-records'), tmpDir);
      const cardTypePath = join(tmpDir, '.cards/local/cardTypes/decision.json');
      const cardType = JSON.parse(readFileSync(cardTypePath, 'utf-8'));
      const obsoletedByField = cardType.customFields.find(
        (field: { name: string }) =>
          field.name === 'decision/fieldTypes/obsoletedBy',
      );
      expect(obsoletedByField).toBeDefined();
      obsoletedByField.enableOverride = true;
      writeFileSync(cardTypePath, JSON.stringify(cardType));

      const cardPath = join(
        tmpDir,
        'cardRoot/decision_5/c/decision_6/index.json',
      );
      const card = JSON.parse(readFileSync(cardPath, 'utf-8'));
      card['decision/fieldTypes/obsoletedBy'] = 'x'.repeat(81);
      writeFileSync(cardPath, JSON.stringify(card));

      const result = await commandHandler.command(Cmd.validate, [], {
        projectPath: tmpDir,
      });
      expect(result.statusCode).toBe(200);
      expect(result.message).toContain(
        "field 'decision/fieldTypes/obsoletedBy' value exceeds the maximum length for 'shortText'",
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
