import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { dirname, join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { Calculate } from '../src/calculate.js';
import { copyDir } from '../src/utils/file-utils.js';
import { fileURLToPath } from 'node:url';
import { Project } from '../src/containers/project.js';
import { QueryResult } from '../src/types/queries.js';
import { WorkflowCategory } from '../src/interfaces/resource-interfaces.js';

use(chaiAsPromised);

const expectedTree: QueryResult<'tree'>[] = [
  {
    key: 'decision_5',
    labels: [],
    cardType: 'decision/cardTypes/simplepage',
    links: [],
    rank: '0|a',
    workflowStateCategory: WorkflowCategory.initial,
    children: [
      {
        key: 'decision_6',
        cardType: 'decision/cardTypes/decision',
        labels: [],
        links: [],
        rank: '0|a',
        notifications: [],
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
    notifications: [],
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
  let calculate: Calculate;

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    const project = new Project(decisionRecordsPath);
    calculate = new Calculate(project);
    await calculate.generate();
  });

  after(() => {
    setTimeout(() => {
      rmSync(testDir, { recursive: true, force: true });
    }, 5000);
  });
  it('run named query successfully', async () => {
    const query = 'tree';

    const res = await calculate.runQuery(query);

    // remove once select is fixed
    delete res[0].workflowState;
    delete res[0].children?.[0].workflowState;
    delete res[0].lastUpdated;
    delete res[0].children?.[0].lastUpdated;

    expect(res).to.deep.equal(expectedTree);
  });
});
