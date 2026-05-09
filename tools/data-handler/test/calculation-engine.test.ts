import { expect, it, describe, beforeAll, afterAll } from 'vitest';

import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { copyDir } from '../src/utils/file-utils.js';
import type { Project } from '../src/containers/project.js';
import type { QueryResult } from '../src/types/queries.js';
import { lpFiles } from '@cyberismo/assets';
import { Calculate } from '../src/commands/calculate.js';
import { getTestProject } from './helpers/test-utils.js';

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
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-calculate-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let project: Project;

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    await project.calculationEngine.generate();
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });
  it('run named queries successfully', async () => {
    const query = 'tree';

    const res = await project.calculationEngine.runQuery(query);

    // remove once select is fixed
    delete res[0].workflowState;
    delete res[0].children?.[0].workflowState;
    delete res[0].lastUpdated;
    delete res[0].children?.[0].lastUpdated;
    expect(res).toEqual(expectedTree);
  });
  it('run clingraph successfully', async () => {
    const res = await project.calculationEngine.runGraph(
      lpFiles.test.model,
      'viewAll.',
      'localApp',
    );

    expect(res).not.toBe('');
  }, 20000);

  it('runWorkflowGraph renders the built-in workflow graph', async () => {
    const calculate = new Calculate(project);
    const res = await calculate.runWorkflowGraph('decision/workflows/simple');
    expect(res).not.toBe('');
    const decoded = Buffer.from(res, 'base64').toString('utf-8');
    expect(decoded).toContain('<svg');
    // Workflow state names should be rendered into the SVG.
    expect(decoded).toContain('Created');
    expect(decoded).toContain('Approved');
  }, 20000);

  it('runWorkflowGraph emphasises the given currentState', async () => {
    const calculate = new Calculate(project);
    const plain = await calculate.runWorkflowGraph('decision/workflows/simple');
    const highlighted = await calculate.runWorkflowGraph(
      'decision/workflows/simple',
      { currentState: 'Approved' },
    );
    expect(highlighted).not.toBe(plain);
    const decoded = Buffer.from(highlighted, 'base64').toString('utf-8');
    expect(decoded).toContain('<svg');
    expect(decoded).toContain('Approved');
  }, 20000);

  describe('replaceContext', () => {
    it('keeps queries working after swapping the underlying ClingoContext', async () => {
      // Capture the original context reference, then swap it out.
      const originalContext = project.calculationEngine.context;
      await project.calculationEngine.replaceContext({ preParsing: false });
      const swappedContext = project.calculationEngine.context;
      // The internal ClingoContext must have been replaced.
      expect(swappedContext).not.toBe(originalContext);

      // After swap, generate() has been re-run by replaceContext, so named
      // queries must keep working against the freshly-populated programs.
      const res = await project.calculationEngine.runQuery('tree');
      expect(res.length).toBeGreaterThan(0);

      // Restore default options so the rest of the suite is unaffected.
      await project.calculationEngine.replaceContext({});
    }, 30000);
  });

  describe('python functions', () => {
    it('concatenate a string, a number and a constant', async () => {
      const res = await project.calculationEngine.runLogicProgram(
        'result(@concatenate("string", 1234, constant)).',
      );
      expect(res.results[0].key).toBe('string1234constant');
    });
    it('concatenate without parameters', async () => {
      const res = await project.calculationEngine.runLogicProgram(
        'result(@concatenate()).',
      );
      expect(res.results[0].key).toBe('');
    });
    it('concatenate with 1 parameter', async () => {
      const res = await project.calculationEngine.runLogicProgram(
        'result(@concatenate("parameter")).',
      );
      expect(res.results[0].key).toBe('parameter');
    });
    it('concatenate with 2 parameters', async () => {
      const res = await project.calculationEngine.runLogicProgram(
        'result(@concatenate("one", "two")).',
      );
      expect(res.results[0].key).toBe('onetwo');
    });
    it('calculate daysSince 2024-01-01', async () => {
      const res = await project.calculationEngine.runLogicProgram(
        'result(@daysSince("2024-01-01")).',
      );
      expect(Number(res.results[0].key)).greaterThan(365);
    });
    it('calculate daysSince "2022-01-15T17:08:50.716Z"', async () => {
      const res = await project.calculationEngine.runLogicProgram(
        'result(@daysSince("2022-01-01T17:08:50.716Z")).',
      );
      expect(Number(res.results[0].key)).greaterThan(1000);
    });
    it('daysSince of an invalid date should be zero', async () => {
      const res = await project.calculationEngine.runLogicProgram(
        'result(@daysSince("23232323")).',
      );
      expect(Number(res.results[0].key)).toBe(0);
    });
    it('daysSince of a number date should be zero', async () => {
      const res = await project.calculationEngine.runLogicProgram(
        'result(@daysSince(1)).',
      );
      expect(Number(res.results[0].key)).toBe(0);
    });
    it('the length of today() should be 10', async () => {
      const res =
        await project.calculationEngine.runLogicProgram('result(@today()).');
      expect(res.results[0].key.length).toBe(10);
    });
    it('wrapping a short string should yield the string itself', async () => {
      const res = await project.calculationEngine.runLogicProgram(
        'result(@wrap("A short string")).',
      );
      expect(res.results[0].key).toBe('A short string');
    });
    it('wrapping a long string', async () => {
      const res = await project.calculationEngine.runLogicProgram(
        'result(@wrap("This is a long string that would be too long as a title of a node in a graph")).',
      );
      expect(res.results[0].key).toBe(
        'This is a long string that<br/>would be too long as a<br/>title of a node in a graph',
      );
    });
    it('wrapping an empty string', async () => {
      const res =
        await project.calculationEngine.runLogicProgram('result(@wrap("")).');
      expect(res.results[0].key).toBe('');
    });
    it('wrapping an integer', async () => {
      const res =
        await project.calculationEngine.runLogicProgram('result(@wrap(5)).');
      expect(res.results[0].key).toBe('');
    });
    it('wrapping a string with &', async () => {
      const res = await project.calculationEngine.runLogicProgram(
        'result(@wrap("this & that")).',
      );
      expect(res.results[0].key).toBe('this &amp; that');
    });
    it('wrapping a string with <', async () => {
      const res = await project.calculationEngine.runLogicProgram(
        'result(@wrap("this < that")).',
      );
      expect(res.results[0].key).toBe('this &lt; that');
    });
    it('wrapping a string with >', async () => {
      const res = await project.calculationEngine.runLogicProgram(
        'result(@wrap("this > that")).',
      );
      expect(res.results[0].key).toBe('this &gt; that');
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
        const result = await project.calculationEngine.runLogicProgram(
          contextAwareProgram,
          testCase.context,
        );
        expect(result.results).toHaveLength(1);
        expect(result.results[0].key).toBe(testCase.expectedResult);
      }
    });
  });
});
