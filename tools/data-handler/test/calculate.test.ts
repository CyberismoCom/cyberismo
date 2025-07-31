import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { dirname, join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { Calculate } from '../src/commands/index.js';
import { copyDir } from '../src/utils/file-utils.js';
import { fileURLToPath } from 'node:url';
import { Project } from '../src/containers/project.js';
import type { QueryResult } from '../src/types/queries.js';
import { lpFiles } from '@cyberismo/assets';

use(chaiAsPromised);

const expectedTree: QueryResult<'tree'>[] = [
  {
    key: 'decision_5',
    cardType: 'decision/cardTypes/simplepage',
    rank: '0|a',
    children: [
      {
        key: 'decision_6',
        cardType: 'decision/cardTypes/decision',
        rank: '0|a',
        title: 'Document Decisions with Decision Records',
      },
    ],
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
  it('run named queries successfully', async () => {
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
    const res = await calculate.runGraph(
      lpFiles.test.model,
      'viewAll.',
      'localApp',
    );

    expect(res).to.not.equal('');
  }).timeout(20000);
  describe('python functions', () => {
    it('concatenate a string, a number and a constant', async () => {
      const res = await calculate.runLogicProgram(
        'result(@concatenate("string", 1234, constant)).',
      );
      expect(res.results[0].key).to.equal('string1234constant');
    });
    it('concatenate without parameters', async () => {
      const res = await calculate.runLogicProgram('result(@concatenate()).');
      expect(res.results[0].key).to.equal('');
    });
    it('concatenate with 1 parameter', async () => {
      const res = await calculate.runLogicProgram(
        'result(@concatenate("parameter")).',
      );
      expect(res.results[0].key).to.equal('parameter');
    });
    it('concatenate with 2 parameters', async () => {
      const res = await calculate.runLogicProgram(
        'result(@concatenate("one", "two")).',
      );
      expect(res.results[0].key).to.equal('onetwo');
    });
    it('calculate daysSince 2024-01-01', async () => {
      const res = await calculate.runLogicProgram(
        'result(@daysSince("2024-01-01")).',
      );
      expect(Number(res.results[0].key)).greaterThan(365);
    });
    it('calculate daysSince "2022-01-15T17:08:50.716Z"', async () => {
      const res = await calculate.runLogicProgram(
        'result(@daysSince("2022-01-01T17:08:50.716Z")).',
      );
      expect(Number(res.results[0].key)).greaterThan(1000);
    });
    it('daysSince of an invalid date should be zero', async () => {
      const res = await calculate.runLogicProgram(
        'result(@daysSince("23232323")).',
      );
      expect(Number(res.results[0].key)).to.equal(0);
    });
    it('daysSince of a number date should be zero', async () => {
      const res = await calculate.runLogicProgram('result(@daysSince(1)).');
      expect(Number(res.results[0].key)).to.equal(0);
    });
    it('the length of today() should be 10', async () => {
      const res = await calculate.runLogicProgram('result(@today()).');
      expect(res.results[0].key.length).to.equal(10);
    });
    it('wrapping a short string should yield the string itself', async () => {
      const res = await calculate.runLogicProgram(
        'result(@wrap("A short string")).',
      );
      expect(res.results[0].key).to.equal('A short string');
    });
    it('wrapping a long string', async () => {
      const res = await calculate.runLogicProgram(
        'result(@wrap("This is a long string that would be too long as a title of a node in a graph")).',
      );
      expect(res.results[0].key).to.equal(
        'This is a long string that<br/>would be too long as a<br/>title of a node in a graph',
      );
    });
    it('wrapping an empty string', async () => {
      const res = await calculate.runLogicProgram('result(@wrap("")).');
      expect(res.results[0].key).to.equal('');
    });
    it('wrapping an integer', async () => {
      const res = await calculate.runLogicProgram('result(@wrap(5)).');
      expect(res.results[0].key).to.equal('');
    });
    it('wrapping a string with &', async () => {
      const res = await calculate.runLogicProgram(
        'result(@wrap("this & that")).',
      );
      expect(res.results[0].key).to.equal('this &amp; that');
    });
    it('wrapping a string with <', async () => {
      const res = await calculate.runLogicProgram(
        'result(@wrap("this < that")).',
      );
      expect(res.results[0].key).to.equal('this &lt; that');
    });
    it('wrapping a string with >', async () => {
      const res = await calculate.runLogicProgram(
        'result(@wrap("this > that")).',
      );
      expect(res.results[0].key).to.equal('this &gt; that');
    });
  });

  describe('context tests', () => {
    it('runLogicProgram should return different results based on context', async () => {
      const contextAwareProgram = `
        result("app-mode") :- localApp.
        result("exported-mode") :- exportedSite.
        result("document-mode") :- exportedDocument.
      `;

      const testCases = [
        { context: 'localApp' as const, expectedResult: 'app-mode' },
        { context: 'exportedSite' as const, expectedResult: 'exported-mode' },
        {
          context: 'exportedDocument' as const,
          expectedResult: 'document-mode',
        },
      ];

      for (const testCase of testCases) {
        const result = await calculate.runLogicProgram(
          contextAwareProgram,
          testCase.context,
        );
        expect(result.results).to.have.length(1);
        expect(result.results[0].key).to.equal(testCase.expectedResult);
      }
    });
  });
});
