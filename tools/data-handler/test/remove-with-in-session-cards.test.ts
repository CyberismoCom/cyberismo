import { expect, it, describe, afterAll, beforeAll } from 'vitest';

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { Cmd, Commands } from '../src/command-handler.js';
import { copyDir } from '../src/utils/file-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-remove-in-session-cards');
const decisionRecordsPath = join(testDir, 'valid/decision-records');

const commandHandler: Commands = new Commands();
const options = { projectPath: decisionRecordsPath };

describe('removing a card type while in-session cards exist', () => {
  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // Regression test: cards created during the session used to enter the
  // card cache with metadata lacking 'links' (DefaultContent.card omits it
  // and only the disk-read path normalized it). deleteCards' link-stripping
  // loop then crashed on the surviving cards with
  // "Cannot read properties of undefined (reading 'filter')".
  it('removing a card type survives cards created earlier in the session', async () => {
    const addResult = await commandHandler.command(
      Cmd.add,
      [
        'card',
        'decision/templates/simplepage',
        'decision/cardTypes/simplepage',
      ],
      options,
    );
    expect(addResult.statusCode).toBe(200);

    const createResult = await commandHandler.command(
      Cmd.create,
      ['card', 'decision/templates/simplepage'],
      options,
    );
    expect(createResult.statusCode).toBe(200);

    const removeResult = await commandHandler.command(
      Cmd.remove,
      ['cardType', 'decision/cardTypes/decision'],
      options,
    );
    expect(removeResult.message ?? 'OK').toBe('OK');
    expect(removeResult.statusCode).toBe(200);
  });
});
