import { expect, it, describe, afterAll, beforeAll } from 'vitest';

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { Cmd, Commands } from '../src/command-handler.js';
import { copyDir } from '../src/utils/file-utils.js';
import type { AddCommandOptions } from '../src/interfaces/command-options.js';

// Create test artifacts in a temp folder.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-command-handler-add-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');

const commandHandler: Commands = new Commands();
const options: AddCommandOptions = { projectPath: decisionRecordsPath };

describe('add command', () => {
  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('add hub to the project (success)', async () => {
    const result = await commandHandler.command(
      Cmd.add,
      ['hub', 'https://example.com/'],
      options,
    );
    expect(result.statusCode).toBe(200);
  });
  it('try to add invalid hub URL to the project', async () => {
    const result = await commandHandler.command(
      Cmd.add,
      ['hub', 'invalid'],
      options,
    );
    expect(result.statusCode).toBe(400);
  });
  it('try to add duplicate hub to the project', async () => {
    await commandHandler.command(
      Cmd.add,
      ['hub', 'https://example.com/'],
      options,
    );
    const result = await commandHandler.command(
      Cmd.add,
      ['hub', 'https://example.com/'],
      options,
    );
    expect(result.statusCode).toBe(400);
  });
  it('try to add hub without URL to the project', async () => {
    const result = await commandHandler.command(Cmd.add, ['hub'], options);
    expect(result.statusCode).toBe(400);
  });
});
