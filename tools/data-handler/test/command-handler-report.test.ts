// testing
import { expect } from 'chai';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// cyberismo
import { type CardsOptions, Cmd, Commands } from '../src/command-handler.js';
import { copyDir } from '../src/utils/file-utils.js';

// validation tests do not modify the content - so they can use the original files
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-command-handler-report-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');

const commandHandler: Commands = new Commands();
const optionsDecision: CardsOptions = {
  projectPath: decisionRecordsPath,
  context: 'localApp',
};

describe('report command', () => {
  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
    await commandHandler.command(Cmd.calc, ['generate'], optionsDecision);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('run test report that returns no data', async () => {
    const parameters = {
      name: 'decision/reports/anotherReport',
      parameters: {
        cardKey: 'decision_1',
      },
    };
    await writeFile(
      join(testDir, 'report.json'),
      JSON.stringify(parameters, null, 2),
      { encoding: 'utf-8' },
    );
    const result = await commandHandler.command(
      Cmd.report,
      [join(testDir, 'report.json')],
      optionsDecision,
    );
    expect(result.statusCode).to.equal(200);
    // decision_1 card does not have children.
    expect(result.message).to.include('No report result');
  });
  it('run test report that returns results', async () => {
    const parameters = {
      name: 'decision/reports/anotherReport',
      parameters: {
        cardKey: 'decision_5',
      },
    };
    await writeFile(
      join(testDir, 'report.json'),
      JSON.stringify(parameters, null, 2),
      { encoding: 'utf-8' },
    );
    const result = await commandHandler.command(
      Cmd.report,
      [join(testDir, 'report.json')],
      optionsDecision,
    );
    expect(result.statusCode).to.equal(200);
    // decision_1 card does not have children.
    expect(result.message).to.include('xref');
  });
  it('run test report and put the results to an output file', async () => {
    const parameters = {
      name: 'decision/reports/anotherReport',
      parameters: {
        cardKey: 'decision_5',
      },
    };
    const outputFile = join(testDir, 'report-output.txt');
    await writeFile(
      join(testDir, 'report.json'),
      JSON.stringify(parameters, null, 2),
      { encoding: 'utf-8' },
    );
    const result = await commandHandler.command(
      Cmd.report,
      [join(testDir, 'report.json'), outputFile],
      optionsDecision,
    );
    expect(result.statusCode).to.equal(200);
    await readFile(outputFile, { encoding: 'utf-8' }).then((data) => {
      expect(data).to.include('xref');
      expect(data).to.include('decision_6'); //decision_6 is decision_5's child
    });
  });
  it('try to run test report that does not exist', async () => {
    const parameters = {
      name: 'decision/reports/i-do-not-exist',
      parameters: {
        cardKey: 'decision_5',
      },
    };
    await writeFile(
      join(testDir, 'report.json'),
      JSON.stringify(parameters, null, 2),
      { encoding: 'utf-8' },
    );
    const result = await commandHandler.command(
      Cmd.report,
      [join(testDir, 'report.json')],
      optionsDecision,
    );
    expect(result.statusCode).to.equal(500);
  });
  it('try to run test report with incorrect parameters', async () => {
    const parameters = {
      name: 'decision/reports/anotherReport',
      parameters: {
        wrong: 'wrong',
      },
    };
    await writeFile(
      join(testDir, 'report.json'),
      JSON.stringify(parameters, null, 2),
      { encoding: 'utf-8' },
    );
    const result = await commandHandler.command(
      Cmd.report,
      [join(testDir, 'report.json')],
      optionsDecision,
    );
    expect(result.statusCode).to.equal(500);
  });
});
