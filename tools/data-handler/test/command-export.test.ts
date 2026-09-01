import { mkdirSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Cmd, CommandManager, Commands } from '../src/command-handler.js';
import { copyDir } from '../src/utils/file-utils.js';
import type { ExportCommandOptions } from '../src/interfaces/command-options.js';
import {
  beforeAll,
  expect,
  afterAll,
  it,
  describe,
  beforeEach,
  afterEach,
} from 'vitest';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-export-tests');
const testDirForExport = join(baseDir, 'tmp-command-export-site-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');
const optionsMini: ExportCommandOptions = { projectPath: minimalPath };

describe('export command', () => {
  const commandHandler = new Commands();

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    optionsMini.projectPath = minimalPath;
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
    rmSync(testDirForExport, { recursive: true, force: true });
  });

  beforeEach(() => {
    rmSync(join(decisionRecordsPath, 'output'), {
      recursive: true,
      force: true,
    });
    rmSync(join(decisionRecordsPath, 'test/output'), {
      recursive: true,
      force: true,
    });
    rmSync(join(minimalPath, 'output'), {
      recursive: true,
      force: true,
    });
    rmSync(join(minimalPath, 'test/output'), {
      recursive: true,
      force: true,
    });
  });
  it('missing project (adoc export)', async () => {
    optionsMini.projectPath = join(testDirForExport, 'valid/i-do-not-exist');
    const output = 'test/output/';
    const result = await commandHandler.command(
      Cmd.export,
      ['adoc', output],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
  });
  it('missing parent card (adoc export)', async () => {
    const output = join(testDirForExport, 'test/output/');
    const card = 'decision_999';
    const result = await commandHandler.command(
      Cmd.export,
      ['adoc', output, card],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
  });
  it('inaccessible destination (adoc export)', async () => {
    const output = join(testDirForExport, '/i-do-not-exist/output');
    const card = 'decision_1';
    const result = await commandHandler.command(
      Cmd.export,
      ['adoc', output, card],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
  });
});

describe('adoc export section order', () => {
  let orderTestDir: string;
  let projectPath: string;

  beforeEach(async () => {
    // Unique dir per test so the CommandManager singleton, keyed on project
    // path, is rebuilt with a fresh cache.
    orderTestDir = join(
      baseDir,
      `tmp-export-order-tests-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    projectPath = join(orderTestDir, 'valid/decision-records');
    mkdirSync(orderTestDir, { recursive: true });
    await copyDir('test/test-data/', orderTestDir);
  });

  afterEach(() => {
    rmSync(orderTestDir, { recursive: true, force: true });
  });

  it('orders the descendants of a card by rank', async () => {
    const commands = await CommandManager.getInstance(projectPath);
    const template = 'decision/templates/decision';

    // Two cards below the level the tree query orders, cached in creation
    // order and ranked the other way around.
    const firstCreated = (
      await commands.createCmd.createCard(template, 'decision_6')
    )[0].key;
    const lastCreated = (
      await commands.createCmd.createCard(template, 'decision_6')
    )[0].key;
    await commands.moveCmd.rankFirst(lastCreated);

    const rankOrder = [lastCreated, firstCreated];
    expect(commands.project.findCard('decision_6').children).not.toEqual(
      rankOrder,
    );

    await commands.project.calculationEngine.generate();
    const output = join(orderTestDir, 'output');
    await commands.exportCmd.exportToADoc(output);

    const adoc = await readFile(join(output, 'index.adoc'), 'utf-8');
    const positionOf = (cardKey: string) =>
      adoc.indexOf(`|Card key|${cardKey}\n`);
    expect(positionOf(lastCreated)).toBeGreaterThan(-1);
    expect(positionOf(lastCreated)).toBeLessThan(positionOf(firstCreated));
  });
});
