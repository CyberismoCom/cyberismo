import { expect, it, describe, beforeAll, afterAll } from 'vitest';

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import { Cmd, Commands } from '../src/command-handler.js';
import { Show } from '../src/commands/index.js';
import { getTestProject } from './helpers/test-utils.js';

// Create test artifacts in a temp folder.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-command-handler-import-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');

const commandHandler: Commands = new Commands();
const options = { projectPath: decisionRecordsPath };

describe('import csv command', () => {
  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('import csv file (success)', async () => {
    const result = await commandHandler.command(
      Cmd.import,
      ['csv', join(testDir, 'valid-real.csv')],
      options,
    );
    expect(result.statusCode).toBe(200);

    const [key1, key2] = result.payload as string[];

    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const show = new Show(project);
    const card1 = await show.showCardDetails(key1);
    const card2 = await show.showCardDetails(key2);
    expect(card1.metadata!.title).toBe('Title1');
    expect(card1.content).toBe('content1');
    expect(card1.metadata!.labels).toEqual([
      'template-test-label',
      'label-first',
      'label-second',
    ]);
    expect(card1.metadata!['decision/fieldTypes/responsible']).toBe(
      'responsible@email.com',
    );
    expect(card1.metadata!.doesnotexist).toBeUndefined();
    expect(card2.metadata!.title).toBe('Title2');
    expect(card2.content).toBe('content2');
    // no labels specified, takes them from the template
    expect(card2.metadata!.labels).toEqual(['template-test-label']);
    expect(card2.metadata!['decision/fieldTypes/responsible']).toBe('');
    expect(card2.metadata!.doesnotexist).toBeUndefined();
  });
  it('import csv file with parent (success)', async () => {
    const parent = 'decision_6';
    const result = await commandHandler.command(
      Cmd.import,
      ['csv', join(testDir, 'valid-real.csv'), parent],
      options,
    );
    expect(result.statusCode).toBe(200);

    const createdKeys = result.payload as string[];
    // Use command handler to get card details for consistent project instance
    const parentCardResult = await commandHandler.command(
      Cmd.show,
      ['card', parent],
      { ...options, details: true },
    );
    expect(parentCardResult.statusCode).toBe(200);
    type ParentCard = { children?: string[] };
    const parentCard = parentCardResult.payload as ParentCard;

    expect(createdKeys).toHaveLength(2);
    expect(parentCard.children).toContain(createdKeys[0]);
    expect(parentCard.children).toContain(createdKeys[1]);
  });
  it('try to import csv file without all required columns', async () => {
    const result = await commandHandler.command(
      Cmd.import,
      ['csv', join(testDir, 'invalid-missing-columns-real.csv')],
      options,
    );
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain("must have required property 'template'");
  });
  it('try to import csv file with invalid path', async () => {
    const result = await commandHandler.command(
      Cmd.import,
      ['csv', 'i-dont-exist.csv'],
      options,
    );
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('ENOENT');
  });
});
