// testing
import { expect, it, describe, beforeEach, afterEach } from 'vitest';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// cyberismo
import type { ReportParameters } from '@cyberismo/model';
import { DHValidationError } from '../src/exceptions/index.js';
import { copyDir } from '../src/utils/file-utils.js';
import type { Workspace } from '../src/workspace/workspace.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-command-handler-report-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');

describe('report', () => {
  let ws: Workspace;

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
    ws = await openTestWorkspace(decisionRecordsPath);
  });

  afterEach(() => {
    ws.checkout.dispose();
    rmSync(testDir, { recursive: true, force: true });
  });

  const run = (name: string, parameters: ReportParameters) =>
    ws.queries.runReport(name, parameters, 'localApp');

  it('run test report that returns no data', async () => {
    // decision_1 card does not have children.
    expect(
      await run('decision/reports/anotherReport', { cardKey: 'decision_1' }),
    ).toBe('');
  });
  it('run test report that returns results', async () => {
    expect(
      await run('decision/reports/anotherReport', { cardKey: 'decision_5' }),
    ).toMatch('xref');
  });
  it('eq helper matches equal values', async () => {
    expect(
      await run('decision/reports/eqNeReport', { cardKey: 'decision_5' }),
    ).toMatch('EQ_MATCH:decision_6');
  });
  it('ne helper does not match equal values', async () => {
    expect(
      await run('decision/reports/eqNeReport', { cardKey: 'decision_5' }),
    ).not.toMatch('NE_MATCH:decision_6');
  });
  it('renders a report without running a query, using math helpers', async () => {
    const result = await run('decision/reports/percentageReport', {
      cardKey: 'decision_1',
      value: 55,
    });
    expect(result).toMatch('Completed: 55%');
    expect(result).toMatch('Remaining: 45%');
    expect(result).toMatch('Doubled: 110');
  });
  it('try to run test report that does not exist', async () => {
    await expect(
      run('decision/reports/i-do-not-exist', { cardKey: 'decision_5' }),
    ).rejects.toThrow(
      "Report 'decision/reports/i-do-not-exist' does not exist",
    );
  });

  // The parameters come from a file the user wrote, so each is checked.
  it.each([
    {
      missing: 'name',
      name: '',
      parameters: { cardKey: 'decision_5' },
      message: 'The parameters file must include a "name" field',
    },
    {
      missing: 'parameters',
      name: 'decision/reports/anotherReport',
      parameters: undefined,
      message: 'The parameters file must include a "parameters" field',
    },
    {
      missing: 'cardKey',
      name: 'decision/reports/anotherReport',
      parameters: { wrong: 'wrong' },
      message: 'The parameters file must include a "cardKey" field',
    },
  ])('refuses parameters without $missing', async (row) => {
    const result = run(row.name, row.parameters as unknown as ReportParameters);
    await expect(result).rejects.toThrow(row.message);
    await expect(result).rejects.toBeInstanceOf(DHValidationError);
  });
});
