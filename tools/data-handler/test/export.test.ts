import { expect } from 'chai';

import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { CardsOptions, Cmd, Commands } from '../src/command-handler.js';
import { copyDir } from '../src/utils/file-utils.js';
import { ExportSite } from '../src/export-site.js';
import { Project } from '../src/containers/project.js';
import { fileURLToPath } from 'node:url';

const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-export-tests');
const testDirForExport = join(baseDir, 'tmp-command-export-site-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');
const options: CardsOptions = { projectPath: decisionRecordsPath };
const optionsMini: CardsOptions = { projectPath: minimalPath };

describe('export-site', () => {
  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
    rmSync(testDirForExport, { recursive: true, force: true });
  });
  it('export site - initialise', async () => {
    const project = new Project(decisionRecordsPath);

    const exportSite = new ExportSite();
    const projectRoot = join(project.cardRootFolder, '..');
    await exportSite.exportToSite(projectRoot, '/tmp/foo');
    expect(true).to.equal(true);
  });
});

describe('export command', () => {
  const commandHandler = new Commands();

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
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
  it('invalid format', async () => {
    optionsMini.format = 'wrong';
    optionsMini.output = join(testDirForExport, 'output');
    const result = await commandHandler.command(Cmd.export, [], optionsMini);
    expect(result.statusCode).to.equal(400);
  });
  it('missing project', async () => {
    optionsMini.format = 'html';
    optionsMini.output = join(testDirForExport, 'test/output/');
    optionsMini.projectPath = 'valid/i-do-not-exist';
    const result = await commandHandler.command(Cmd.export, [], optionsMini);
    expect(result.statusCode).to.equal(400);
  });
  it('missing parent card', async () => {
    optionsMini.format = 'html';
    optionsMini.output = join(testDirForExport, 'test/output/');
    optionsMini.projectPath = minimalPath;
    const card = 'decision_999';
    const result = await commandHandler.command(
      Cmd.export,
      [card],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('inaccessible destination', async () => {
    optionsMini.format = 'html';
    optionsMini.output = join(testDirForExport, '/i-do-not-exist/output');
    const card = 'decision_1';
    const result = await commandHandler.command(
      Cmd.export,
      [card],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });
});
