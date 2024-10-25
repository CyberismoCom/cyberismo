import { expect, use } from 'chai';
import { dirname, join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import { Calculate } from '../src/calculate.js';
import { copyDir } from '../src/utils/file-utils.js';
import { fileURLToPath } from 'node:url';

import chaiAsPromised from 'chai-as-promised';
import { QueryResult } from '../src/types/queries.js';
import { WorkflowCategory } from '../src/interfaces/project-interfaces.js';
use(chaiAsPromised);

const calculate = new Calculate();

const expectedTree: QueryResult<'tree'>[] = [
  {
    key: 'decision_5',
    labels: [],
    links: [],
    rank: '0|a',
    workflowStateCategory: WorkflowCategory.initial,
    results: [
      {
        key: 'decision_6',
        labels: [],
        links: [],
        results: [],
        rank: '0|a',
        policyChecks: { successes: [], failures: [] },
        workflowStateCategory: WorkflowCategory.closed,
        deniedOperations: {
          transition: [],
          move: [],
          delete: [],
          editField: [],
          editContent: [],
        },
        title: 'Document Decisions with Decision Records',
      },
    ],
    policyChecks: { successes: [], failures: [] },
    deniedOperations: {
      transition: [],
      move: [],
      delete: [],
      editField: [],
      editContent: [],
    },
    title: 'Decision Records',
  },
];

describe('calculate', () => {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const testDir = join(baseDir, 'tmp-calculate-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    await calculate.generate(decisionRecordsPath);
  });

  after(() => {
    setTimeout(() => {
      rmSync(testDir, { recursive: true, force: true });
    }, 5000);
  });
  it('run named query successfully', async () => {
    const query = 'tree';

    const res = await calculate.runQuery(decisionRecordsPath, query);

    expect(res.results).to.deep.equal(expectedTree);
    expect(res.error).to.eq(null);
  });
});
