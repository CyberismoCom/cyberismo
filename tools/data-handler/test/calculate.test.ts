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
  it('run clingraph successfully', async () => {
    const res = await calculate.runGraph({
      query: 'viewAll.',
      file: '../../calculations/test/model.lp',
    });

    expect(res).to.not.equal('');
  }).timeout(20000);
  describe('python functions', () => {
    it('concatenate a string, a number and a constant', async () => {
      const res = await calculate.runLogicProgram({
        query: 'result(@concatenate("string", 1234, constant)).',
      });
      expect(res.results[0].key).to.equal('string1234constant');
    });
    it('concatenate without parameters', async () => {
      const res = await calculate.runLogicProgram({
        query: 'result(@concatenate()).',
      });
      expect(res.results[0].key).to.equal('');
    });
    it('concatenate with 1 parameter', async () => {
      const res = await calculate.runLogicProgram({
        query: 'result(@concatenate("parameter")).',
      });
      expect(res.results[0].key).to.equal('parameter');
    });
    it('concatenate with 2 parameters', async () => {
      const res = await calculate.runLogicProgram({
        query: 'result(@concatenate("one", "two")).',
      });
      expect(res.results[0].key).to.equal('onetwo');
    });
    it('calculate daysSince 2024-01-01', async () => {
      const res = await calculate.runLogicProgram({
        query: 'result(@daysSince("2024-01-01")).',
      });
      expect(Number(res.results[0].key)).greaterThan(365);
    });
    it('calculate daysSince "2022-01-15T17:08:50.716Z"', async () => {
      const res = await calculate.runLogicProgram({
        query: 'result(@daysSince("2022-01-01T17:08:50.716Z")).',
      });
      expect(Number(res.results[0].key)).greaterThan(1000);
    });
    it('daysSince of an invalid date should be zero', async () => {
      const res = await calculate.runLogicProgram({
        query: 'result(@daysSince("23232323")).',
      });
      expect(Number(res.results[0].key)).to.equal(0);
    });
    it('daysSince of a number date should be zero', async () => {
      const res = await calculate.runLogicProgram({
        query: 'result(@daysSince(1)).',
      });
      expect(Number(res.results[0].key)).to.equal(0);
    });
    it('the length of today() should be 10', async () => {
      const res = await calculate.runLogicProgram({
        query: 'result(@today()).',
      });
      expect(res.results[0].key.length).to.equal(10);
    });
  });
});
