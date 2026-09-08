import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { ClingoContext, clearCache } from '@cyberismo/node-clingo';
import type { SolveOptions } from '@cyberismo/node-clingo';

import { copyDir } from '../src/utils/file-utils.js';
import { generateReportContent } from '../src/utils/report.js';
import { getTestProject } from './helpers/test-utils.js';
import { queries } from '../src/types/queries.js';

import type { CalculationEngine } from '../src/containers/project/calculation-engine.js';
import type { Project } from '../src/containers/project.js';
import type {
  BaseResult,
  ParseResult,
  QueryName,
} from '../src/types/queries.js';

// Exactness test for the snapshot (commit()+solve(..., {snapshot:true})) path
// introduced behind CYBERISMO_DERIVED_CACHE: it must return the exact same
// answer atoms as a full solve, in both directions -- neither extra atoms
// (a query-layer rule deriving a knowledge predicate) nor missing atoms (the
// snapshot side losing a rule the query layer depends on).
//
// The comparison happens at the raw-answer-atom level, not on runQuery()'s
// parsed objects: CalculationEngine has no public API that returns raw
// answers for a named query, so this spies on two seams the engine's own
// code already passes through --
//   - ClingoContext.prototype.solve() (from @cyberismo/node-clingo), to
//     capture stats.inject and whether { snapshot: true } was actually used,
//     proving the snapshot path was genuinely exercised and not silently
//     abandoned via the SNAPSHOT_MISSING/STALE fallback;
//   - CalculationEngine's own parseClingoResult(), to capture the raw answer
//     strings before they are interpreted into query-result objects.
// Neither seam is new API surface; both already exist for production use.

interface QueryCapture {
  /** Flattened, trimmed, non-empty atoms across every answer of the run. */
  atoms: string[];
  solveCalls: { snapshot: boolean; inject: number }[];
}

async function captureQuery(
  engine: CalculationEngine,
  run: () => Promise<unknown>,
): Promise<QueryCapture> {
  // Several fixture reports share byte-identical query text (see
  // REPORT_CASES), which would otherwise share a result-cache entry and
  // report stats.inject: 0 on a cache hit -- indistinguishable from a
  // fallback to a full solve. Starting from a cold cache makes every call
  // here a genuine solve, so inject > 0 is real proof each time.
  clearCache();

  const solveCalls: QueryCapture['solveCalls'] = [];
  const originalSolve = ClingoContext.prototype.solve;
  const solveSpy = vi
    .spyOn(ClingoContext.prototype, 'solve')
    .mockImplementation(async function (
      this: ClingoContext,
      program: string,
      categories?: string[],
      options?: SolveOptions,
    ) {
      const result = await originalSolve.call(
        this,
        program,
        categories,
        options,
      );
      solveCalls.push({
        snapshot: options?.snapshot === true,
        inject: result.stats.inject,
      });
      return result;
    });

  let atoms: string[] = [];
  const engineInternals = engine as unknown as {
    parseClingoResult(data: string[]): Promise<ParseResult<BaseResult>>;
  };
  const originalParse = engineInternals.parseClingoResult.bind(engineInternals);
  const parseSpy = vi
    .spyOn(engineInternals, 'parseClingoResult')
    .mockImplementation(async (data: string[]) => {
      atoms = data
        .flatMap((answer) => answer.split('\n'))
        .map((atom) => atom.trim())
        .filter(Boolean);
      return originalParse(data);
    });

  try {
    await run();
  } finally {
    solveSpy.mockRestore();
    parseSpy.mockRestore();
  }

  return { atoms, solveCalls };
}

// Only the query side is under test here, so the content template is left
// empty rather than passed through as-is: testReport's real content
// template invokes a standalone (non-block) macro, which
// generateReportContent()'s placeholder macro registration can only render
// in block form -- a pre-existing quirk of content rendering, orthogonal to
// what this test compares.
async function captureReport(
  engine: CalculationEngine,
  queryTemplate: string,
  options: Record<string, unknown>,
): Promise<QueryCapture> {
  return captureQuery(engine, () =>
    generateReportContent({
      calculate: engine,
      contentTemplate: '',
      queryTemplate,
      options,
      context: 'localApp',
    }),
  );
}

function reportQueryTemplate(project: Project, shortName: string): string {
  const fullName = `decision/reports/${shortName}`;
  const report = project.resources
    .reports()
    .find((r) => r.data?.name === fullName);
  if (!report) {
    throw new Error(`Fixture is missing expected report '${fullName}'`);
  }
  return report.show().content.queryTemplate;
}

// Asserts the snapshot path was genuinely exercised (not a silent fallback)
// and that its answer atoms exactly match the full solve's, reporting extra
// and missing atoms separately so a failure shows which direction diverged.
function assertExactMatch(
  label: string,
  snapshot: QueryCapture,
  full: QueryCapture,
  { expectNonEmpty }: { expectNonEmpty: boolean },
) {
  expect(
    snapshot.solveCalls.length,
    `${label}: snapshot-path engine made ${snapshot.solveCalls.length} solve() call(s), expected exactly 1 -- a second call means it fell back to a full solve`,
  ).toBe(1);
  expect(
    snapshot.solveCalls[0].snapshot,
    `${label}: snapshot-path engine did not pass { snapshot: true } to solve()`,
  ).toBe(true);
  expect(
    snapshot.solveCalls[0].inject,
    `${label}: stats.inject was 0 on the snapshot path -- commit() likely never succeeded, so this would compare the full solve against itself`,
  ).toBeGreaterThan(0);

  expect(
    full.solveCalls.length,
    `${label}: full-path engine made an unexpected number of solve() calls`,
  ).toBe(1);
  expect(full.solveCalls[0].snapshot).toBe(false);
  expect(full.solveCalls[0].inject).toBe(0);

  const snapshotSet = new Set(snapshot.atoms);
  const fullSet = new Set(full.atoms);
  const onlyInSnapshot = [...snapshotSet]
    .filter((atom) => !fullSet.has(atom))
    .sort();
  const onlyInFull = [...fullSet]
    .filter((atom) => !snapshotSet.has(atom))
    .sort();

  expect(
    onlyInSnapshot,
    `${label}: atoms the snapshot path produced that the full path did not (extra)`,
  ).toEqual([]);
  expect(
    onlyInFull,
    `${label}: atoms the full path produced that the snapshot path did not (missing)`,
  ).toEqual([]);
  expect(
    snapshot.atoms.length,
    `${label}: same atom set but different raw counts (snapshot=${snapshot.atoms.length}, full=${full.atoms.length}) -- a duplicate on one side`,
  ).toBe(full.atoms.length);

  if (expectNonEmpty) {
    expect(
      full.atoms.length,
      `${label}: produced zero atoms on both sides -- the comparison would be vacuous`,
    ).toBeGreaterThan(0);
  }
}

interface NamedQueryCase {
  name: QueryName;
  options: Record<string, unknown>;
  // false only where the fixture genuinely has nothing to derive (no
  // connectors or skills are defined), so an empty result is expected
  // rather than a sign the comparison is vacuous.
  expectNonEmpty: boolean;
}

const NAMED_QUERY_CASES: NamedQueryCase[] = [
  { name: 'tree', options: {}, expectNonEmpty: true },
  { name: 'card', options: {}, expectNonEmpty: true },
  { name: 'connectors', options: {}, expectNonEmpty: false },
  { name: 'enabledSkills', options: {}, expectNonEmpty: false },
  {
    name: 'onCreation',
    options: { cardKeys: ['decision_6'] },
    expectNonEmpty: true,
  },
  {
    name: 'onTransition',
    options: { cardKey: 'decision_6', transition: 'Deprecate' },
    expectNonEmpty: true,
  },
];

// anotherReport, eqNeReport and testReport have a real query.lp.hbs that
// walks the tree from a cardKey. divideByZeroReport and percentageReport are
// intentionally excluded: their query.lp.hbs is 0 bytes, so
// generateReportContent() skips Clingo entirely for them -- there is no
// solve, and therefore no answer atoms, to compare on either path.
const REPORT_CASES = ['anotherReport', 'eqNeReport', 'testReport'] as const;

describe('derived cache exactness', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-derived-cache-tests');
  const snapshotProjectPath = join(
    testDir,
    'snapshot',
    'valid',
    'decision-records',
  );
  const fullProjectPath = join(testDir, 'full', 'valid', 'decision-records');

  let snapshotProject: Project;
  let fullProject: Project;
  let originalEnv: string | undefined;

  const snapshotCaptures = new Map<string, QueryCapture>();
  const fullCaptures = new Map<string, QueryCapture>();

  beforeAll(async () => {
    originalEnv = process.env.CYBERISMO_DERIVED_CACHE;
    // Belt-and-braces: the result cache is a process-wide global, so start
    // from empty rather than trust that no earlier test file left an entry
    // that happens to share a hash with one of ours.
    clearCache();

    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', join(testDir, 'snapshot'));
    await copyDir('test/test-data/', join(testDir, 'full'));

    // derivedCacheEnabled is read once, at CalculationEngine construction
    // (via `new Project()`), so the env var must be set before each
    // engine is built -- these two must not be constructed concurrently.
    process.env.CYBERISMO_DERIVED_CACHE = '1';
    snapshotProject = getTestProject(snapshotProjectPath);
    await snapshotProject.populateCaches();
    await snapshotProject.calculationEngine.generate();

    process.env.CYBERISMO_DERIVED_CACHE = '0';
    fullProject = getTestProject(fullProjectPath);
    await fullProject.populateCaches();
    await fullProject.calculationEngine.generate();

    for (const { name, options } of NAMED_QUERY_CASES) {
      snapshotCaptures.set(
        name,
        await captureQuery(snapshotProject.calculationEngine, () =>
          snapshotProject.calculationEngine.runQuery(name, 'localApp', options),
        ),
      );
      fullCaptures.set(
        name,
        await captureQuery(fullProject.calculationEngine, () =>
          fullProject.calculationEngine.runQuery(name, 'localApp', options),
        ),
      );
    }

    for (const name of REPORT_CASES) {
      const reportOptions = { cardKey: 'decision_5' };
      snapshotCaptures.set(
        name,
        await captureReport(
          snapshotProject.calculationEngine,
          reportQueryTemplate(snapshotProject, name),
          reportOptions,
        ),
      );
      fullCaptures.set(
        name,
        await captureReport(
          fullProject.calculationEngine,
          reportQueryTemplate(fullProject, name),
          reportOptions,
        ),
      );
    }
  });

  afterAll(() => {
    if (originalEnv === undefined) {
      delete process.env.CYBERISMO_DERIVED_CACHE;
    } else {
      process.env.CYBERISMO_DERIVED_CACHE = originalEnv;
    }
    rmSync(testDir, { recursive: true, force: true });
  });

  it('covers every named query the engine exposes', () => {
    expect(NAMED_QUERY_CASES.map((c) => c.name).sort()).toEqual(
      [...queries].sort(),
    );
  });

  it('covers every fixture report with a non-empty query, and explains the rest', () => {
    const allReports = snapshotProject.resources
      .reports()
      .map((r) => r.data?.name)
      .sort();
    expect(allReports).toEqual(
      [
        'decision/reports/anotherReport',
        'decision/reports/divideByZeroReport',
        'decision/reports/eqNeReport',
        'decision/reports/percentageReport',
        'decision/reports/testReport',
      ].sort(),
    );
  });

  for (const { name, expectNonEmpty } of NAMED_QUERY_CASES) {
    it(`named query "${name}" matches between the snapshot and full solve`, () => {
      assertExactMatch(
        `query:${name}`,
        snapshotCaptures.get(name)!,
        fullCaptures.get(name)!,
        { expectNonEmpty },
      );
    });
  }

  for (const name of REPORT_CASES) {
    it(`report "${name}" matches between the snapshot and full solve`, () => {
      assertExactMatch(
        `report:${name}`,
        snapshotCaptures.get(name)!,
        fullCaptures.get(name)!,
        { expectNonEmpty: true },
      );
    });
  }
});
