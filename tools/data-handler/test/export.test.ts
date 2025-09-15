import { expect } from 'chai';

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { type CardsOptions, Cmd, Commands } from '../src/command-handler.js';
import { copyDir } from '../src/utils/file-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-export-tests');
const testDirForExport = join(baseDir, 'tmp-command-export-site-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');
const optionsMini: CardsOptions = { projectPath: minimalPath };

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
  it('missing project (adoc export)', async () => {
    optionsMini.projectPath = join(testDirForExport, 'valid/i-do-not-exist');
    const output = 'test/output/';
    const result = await commandHandler.command(
      Cmd.export,
      ['adoc', output],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('missing parent card (adoc export)', async () => {
    const output = join(testDirForExport, 'test/output/');
    const card = 'decision_999';
    const result = await commandHandler.command(
      Cmd.export,
      ['adoc', output, card],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('inaccessible destination (adoc export)', async () => {
    const output = join(testDirForExport, '/i-do-not-exist/output');
    const card = 'decision_1';
    const result = await commandHandler.command(
      Cmd.export,
      ['adoc', output, card],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });
});
