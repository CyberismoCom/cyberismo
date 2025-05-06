import { expect } from 'chai';

import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { CardsOptions } from '../src/command-handler.js';
import { Cmd, Commands } from '../src/command-handler.js';
import { CommandManager } from '../src/command-manager.js';
import { copyDir } from '../src/utils/file-utils.js';
import { ExportSite } from '../src/commands/index.js';
import { fileURLToPath } from 'node:url';

const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-export-tests');
const testDirForExport = join(baseDir, 'tmp-command-export-site-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');
const options: CardsOptions = { projectPath: decisionRecordsPath };
const optionsMini: CardsOptions = { projectPath: minimalPath };
let commands: CommandManager;

describe('export-site', () => {
  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    commands = new CommandManager(decisionRecordsPath);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
    rmSync(testDirForExport, { recursive: true, force: true });
  });
  it('export site (success)', async () => {
    const exportSite = new ExportSite(
      commands.project,
      commands.calculateCmd,
      commands.showCmd,
    );
    await exportSite.exportToSite('/tmp/foo', undefined, {
      silent: true,
    });
    expect(true).to.equal(true);
  }).timeout(20000);
});

describe('export command', () => {
  const commandHandler = new Commands();

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    optionsMini.projectPath = minimalPath;
  });

  after(() => {
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
  it('export to HTML (success)', async () => {
    const result = await commandHandler.command(
      Cmd.export,
      ['html', join(testDirForExport, 'output')],
      optionsMini,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('export partial tree to HTML (success)', async () => {
    const card = 'decision_5';
    const result = await commandHandler.command(
      Cmd.export,
      ['html', join(testDirForExport, 'output'), card],
      options,
    );
    expect(result.message).to.be.equal(undefined);
    expect(result.statusCode).to.equal(200);
  });
  it('missing project', async () => {
    optionsMini.projectPath = join(testDirForExport, 'valid/i-do-not-exist');
    const output = 'test/output/';
    const result = await commandHandler.command(
      Cmd.export,
      ['html', output],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('missing parent card', async () => {
    const output = join(testDirForExport, 'test/output/');
    const card = 'decision_999';
    const result = await commandHandler.command(
      Cmd.export,
      ['html', output, card],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('inaccessible destination', async () => {
    const output = join(testDirForExport, '/i-do-not-exist/output');
    const card = 'decision_1';
    const result = await commandHandler.command(
      Cmd.export,
      ['html', output, card],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });
});
