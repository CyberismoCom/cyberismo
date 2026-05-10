/**
 * Main benchmark — consumes pre-generated fixtures (see generate-fixtures.ts).
 *
 * For every project under `<fixturesDir>/`, for every scale under
 * `<fixturesDir>/<project>/`, runs all six variants:
 *
 *   - baseline                — clingo binary on pre-built old-QL programs
 *   - baseline+resultfield    — clingo binary on pre-built current-QL programs
 *   - c-api                   — native addon, swapped to old QL, pre-parsing
 *                                OFF (`preParsing: false`).
 *   - c-api+resultfield       — native addon, current QL, pre-parsing OFF
 *                                (`preParsing: false`) — represents the
 *                                "C-API + new QL only" configuration so the
 *                                next variant can isolate the pre-parsing
 *                                contribution. NOTE: the addon's default is
 *                                `preParsing: true`, so the explicit `false`
 *                                here is what makes the cumulative variant
 *                                story honest.
 *   - c-api+preparsing        — native addon, current QL, pre-parsing ON
 *                                (`preParsing: true`) — programs are parsed
 *                                to ASPIF at add-time, not solve-time. Wired
 *                                by replacing the ClingoContext via
 *                                CalculationEngine.replaceContext.
 *   - incremental             — clingo binary on pre-grounded ASPIF + per-query
 *                                LP (current QL + utils + query)
 *
 * No project scaling, no Handlebars compilation, no in-line program building
 * happens on the hot path. All of that is baked into the fixture.
 */
import { CommandManager } from '@cyberismo/data-handler';
import type { ClingoContext } from '@cyberismo/node-clingo';
import { lpFiles } from '@cyberismo/assets';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { solveBinary, solveAspifWithQuery } from './binary-baseline.js';
import {
  loadBaselineFiles,
  swapToOldQL,
  restoreCurrentQL,
} from './baseline-ql.js';
import {
  listProjects,
  listScales,
  loadFixture,
  programPath,
  incrementalAspifPath,
} from './fixture-loader.js';
import type { FixtureBundle, FixtureCards } from './fixture-loader.js';
import { writeResults, machineName } from './utils.js';
import type { BenchmarkRun, BenchmarkResult, CellTiming } from './types.js';

// ── CLI args ────────────────────────────────────────────────────────────────
const fixturesDir = process.argv[2];
const outputPath = process.argv[3] ?? 'results-main.json';

if (!fixturesDir) {
  console.error('Usage: tsx src/bench-main.ts <fixtures-dir> [output-path]');
  process.exit(1);
}

// ── Constants ────────────────────────────────────────────────────────────────
const RUNS_PER_POINT = 3;
// Per-variant warmup: discard the first N solves after each context state
// change (replaceContext, swapToOldQL). Absorbs the one-shot cost of the
// addon/macro pipeline populating its caches on the new context — without
// this, the first run's wall-clock contaminates the cell's std and produces
// the negative-going error bands seen in early runs.
const VARIANT_WARMUP = 2;
const WARMUP_RUNS = 3;
const FEATURE = 'main-scaling';

// ── Card-query slot mapping (which fixture cards.json key gates which query) ─
const QUERY_TO_CARD_KEY: Record<string, keyof FixtureCards> = {
  'card-leaf-task': 'leafKey',
  'card-phase': 'phaseKey',
  'card-risk': 'riskKey',
  'card-root': 'rootKey',
};
const CARD_QUERIES = Object.keys(QUERY_TO_CARD_KEY);

// ── BenchmarkRun factories ──────────────────────────────────────────────────
function makeNativeRun(
  variant: string,
  query: string,
  cardCount: number,
  run: number,
  project: string,
  result: Awaited<ReturnType<ClingoContext['solve']>>,
): BenchmarkRun {
  const s = result.stats;
  return {
    method: 'native',
    feature: FEATURE,
    variant,
    query,
    project,
    cardCount,
    run,
    glueUs: s.glue,
    addUs: s.add,
    groundUs: s.ground,
    solveUs: s.solve,
    totalUs: s.glue + s.add + s.ground + s.solve,
    cacheHit: s.cacheHit,
  };
}

function makeBinaryRun(
  variant: string,
  query: string,
  cardCount: number,
  run: number,
  project: string,
  result: Awaited<ReturnType<typeof solveBinary>>,
): BenchmarkRun {
  return {
    method: 'binary',
    feature: FEATURE,
    variant,
    query,
    project,
    cardCount,
    run,
    glueUs: 0,
    addUs: 0,
    groundUs: 0,
    solveUs: 0,
    totalUs: Math.round(result.wallClockMs * 1000),
    cacheHit: false,
    wallClockMs: result.wallClockMs,
  };
}

/**
 * Incremental run record. Per-run timing is the clingo solve over the prebuilt
 * ASPIF + per-query LP — gringo is fixture-build cost and is NOT included
 * here. We surface the wall-clock as `solveUs` and `totalUs` and leave
 * `glueUs`/`addUs`/`groundUs` zero (preserves BenchmarkRun shape).
 */
function makeIncrementalRun(
  query: string,
  cardCount: number,
  run: number,
  project: string,
  clingoMs: number,
): BenchmarkRun {
  return {
    method: 'pregrounding',
    feature: FEATURE,
    variant: 'incremental',
    query,
    project,
    cardCount,
    run,
    glueUs: 0,
    addUs: 0,
    groundUs: 0,
    solveUs: Math.round(clingoMs * 1000),
    totalUs: Math.round(clingoMs * 1000),
    cacheHit: false,
    wallClockMs: clingoMs,
  };
}

/**
 * Returns the list of (queryName, lpFile) tuples to run for this project,
 * always including `tree`, plus any card-query whose target key is present in
 * `cards.json`.
 */
function activeQueries(bundle: FixtureBundle): string[] {
  const out = ['tree'];
  for (const q of CARD_QUERIES) {
    const key = QUERY_TO_CARD_KEY[q];
    if (bundle.cards[key]) out.push(q);
  }
  return out;
}

// ── Per-fixture worker ──────────────────────────────────────────────────────
async function runFixture(
  bundle: FixtureBundle,
  allRuns: BenchmarkRun[],
): Promise<void> {
  const { meta, projectDir } = bundle;
  const projectName = meta.project;
  const scale = meta.scale;
  const cardCount = meta.cardCount;
  const queries = activeQueries(bundle);

  console.error(
    `\n=== project=${projectName} scale=${scale} (cardCount=${cardCount}) ===`,
  );

  const bf = await loadBaselineFiles();
  const commands = await CommandManager.getInstance(projectDir);
  const projectId = commands.project.projectPrefix;

  try {
    // ── VARIANT: baseline (binary + old QL) ────────────────────────────────
    console.error('  variant: baseline');
    for (const queryName of queries) {
      const program = await readFile(
        programPath(bundle, 'baseline', queryName),
        'utf-8',
      );
      for (let run = 1; run <= RUNS_PER_POINT; run++) {
        const r = await solveBinary(program);
        allRuns.push(
          makeBinaryRun('baseline', queryName, cardCount, run, projectId, r),
        );
      }
      console.error(`    ${queryName}: ${RUNS_PER_POINT} runs done`);
    }

    // ── VARIANT: baseline+resultfield (binary + current QL) ────────────────
    console.error('  variant: baseline+resultfield');
    for (const queryName of queries) {
      const program = await readFile(
        programPath(bundle, 'baseline+resultfield', queryName),
        'utf-8',
      );
      for (let run = 1; run <= RUNS_PER_POINT; run++) {
        const r = await solveBinary(program);
        allRuns.push(
          makeBinaryRun(
            'baseline+resultfield',
            queryName,
            cardCount,
            run,
            projectId,
            r,
          ),
        );
      }
      console.error(`    ${queryName}: ${RUNS_PER_POINT} runs done`);
    }

    // ── INVARIANT ─────────────────────────────────────────────────────────
    // IMPORTANT: Each variant block below must unconditionally set ALL its
    // solver flags (here: which QL variant is loaded into the addon) at its
    // start. Never rely on carry-over state from the previous block —
    // reordering variants must not silently change measurements.
    // `restoreCurrentQL` is an idempotent setProgram call; calling it at the
    // start of a variant that already has the current QL loaded is a cheap
    // no-op that we accept for safety.
    // ──────────────────────────────────────────────────────────────────────

    // ── VARIANT: c-api (native + old QL, pre-parsing OFF) ────────────────
    // Rebuild the context with `preParsing: false` so this variant matches
    // the chapter's cumulative-story contract: `c-api+preparsing` later flips
    // pre-parsing back on, isolating its contribution. (The addon's default
    // is `preParsing: true`, so we must set it explicitly.)
    console.error('  variant: c-api');
    await commands.project.calculationEngine.replaceContext({
      preParsing: false,
    });
    const capiCtx = commands.project.calculationEngine.context;
    swapToOldQL(capiCtx, bf);
    try {
      // warmup discards the first VARIANT_WARMUP solves after the context
      // state change (replaceContext + swapToOldQL).
      const warmupQuery = bundle.queries.tree;
      for (let i = 0; i < VARIANT_WARMUP; i++) {
        await capiCtx.solve(warmupQuery, ['all'], { cache: false });
      }
      for (const queryName of queries) {
        const query = bundle.queries[queryName];
        if (!query) continue;
        for (let run = 1; run <= RUNS_PER_POINT; run++) {
          const r = await capiCtx.solve(query, ['all'], { cache: false });
          allRuns.push(
            makeNativeRun('c-api', queryName, cardCount, run, projectId, r),
          );
        }
        console.error(`    ${queryName}: ${RUNS_PER_POINT} runs done`);
      }
    } finally {
      restoreCurrentQL(capiCtx);
    }

    // ── VARIANT: c-api+resultfield (native + current QL, pre-parsing OFF) ─
    // Unconditionally rebuild the context with `preParsing: false` so this
    // variant represents the "C-API + new QL only" point in the cumulative
    // story (per invariant above). The c-api+preparsing variant later flips
    // this back on to isolate the pre-parsing contribution. The addon default
    // is `preParsing: true`, so the explicit `false` is necessary to get a
    // meaningful comparison between c-api+resultfield and c-api+preparsing.
    console.error('  variant: c-api+resultfield');
    await commands.project.calculationEngine.replaceContext({
      preParsing: false,
    });
    const resultfieldCtx = commands.project.calculationEngine.context;
    {
      const warmupQuery = bundle.queries.tree;
      for (let i = 0; i < VARIANT_WARMUP; i++) {
        await resultfieldCtx.solve(warmupQuery, ['all'], { cache: false });
      }
    }
    for (const queryName of queries) {
      const query = bundle.queries[queryName];
      if (!query) continue;
      for (let run = 1; run <= RUNS_PER_POINT; run++) {
        const r = await resultfieldCtx.solve(query, ['all'], { cache: false });
        allRuns.push(
          makeNativeRun(
            'c-api+resultfield',
            queryName,
            cardCount,
            run,
            projectId,
            r,
          ),
        );
      }
      console.error(`    ${queryName}: ${RUNS_PER_POINT} runs done`);
    }

    // ── VARIANT: incremental (prebuilt ASPIF + per-query LP) ──────────────
    // Runs before c-api+preparsing because incremental uses the binary path
    // and is independent of the in-process ClingoContext state.
    console.error('  variant: incremental');
    const aspifPath = incrementalAspifPath(bundle);
    for (const queryName of queries) {
      const specificQuery = bundle.queries[queryName];
      if (!specificQuery) continue;
      const queryProgram =
        lpFiles.common.queryLanguage +
        '\n' +
        lpFiles.common.utils +
        '\n' +
        specificQuery;
      for (let run = 1; run <= RUNS_PER_POINT; run++) {
        const r = await solveAspifWithQuery(aspifPath, queryProgram);
        allRuns.push(
          makeIncrementalRun(queryName, cardCount, run, projectId, r.clingoMs),
        );
      }
      console.error(`    ${queryName}: ${RUNS_PER_POINT} runs done`);
    }

    // ── VARIANT: c-api+preparsing (native + current QL + pre-parsing) ─────
    // This variant differs from c-api+resultfield at the addon level: we
    // construct a fresh ClingoContext with `preParsing: true` so programs are
    // parsed to ASPIF when set (not on every solve). `replaceContext` swaps
    // the underlying context inside CalculationEngine and re-runs `generate()`
    // to populate it. We run this LAST in the cell so we don't need to
    // restore the original context — `commands.project.dispose()` happens in
    // the enclosing `finally`.
    console.error('  variant: c-api+preparsing');
    await commands.project.calculationEngine.replaceContext({
      preParsing: true,
    });
    const preparsingCtx = commands.project.calculationEngine.context;
    {
      const warmupQuery = bundle.queries.tree;
      for (let i = 0; i < VARIANT_WARMUP; i++) {
        await preparsingCtx.solve(warmupQuery, ['all'], { cache: false });
      }
    }
    for (const queryName of queries) {
      const query = bundle.queries[queryName];
      if (!query) continue;
      for (let run = 1; run <= RUNS_PER_POINT; run++) {
        const r = await preparsingCtx.solve(query, ['all'], { cache: false });
        allRuns.push(
          makeNativeRun(
            'c-api+preparsing',
            queryName,
            cardCount,
            run,
            projectId,
            r,
          ),
        );
      }
      console.error(`    ${queryName}: ${RUNS_PER_POINT} runs done`);
    }
  } finally {
    commands.project.dispose();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const root = resolve(fixturesDir);
  const projects = await listProjects(root);
  if (projects.length === 0) {
    console.error(`No project directories found under ${root}.`);
    process.exit(1);
  }
  console.error(`Discovered projects: ${projects.join(', ')}`);

  const allRuns: BenchmarkRun[] = [];
  const allScalesUnion = new Set<number>();
  const cellTimings: CellTiming[] = [];

  for (const project of projects) {
    const scales = await listScales(root, project);
    if (scales.length === 0) {
      console.error(`  project=${project}: no scales found, skipping`);
      continue;
    }
    console.error(`  project=${project}: scales=[${scales.join(', ')}]`);
    scales.forEach((s) => allScalesUnion.add(s));

    // Warm-up: 3 native solves of `tree` at the smallest scale of THIS project
    const warmupScale = scales[0];
    const warmupBundle = await loadFixture(root, project, warmupScale);
    {
      console.error(
        `  warmup: ${WARMUP_RUNS} solves of tree at scale=${warmupScale}`,
      );
      const warmupCmds = await CommandManager.getInstance(
        warmupBundle.projectDir,
      );
      const warmupCtx = warmupCmds.project.calculationEngine.context;
      const treeQuery = warmupBundle.queries.tree;
      try {
        for (let i = 0; i < WARMUP_RUNS; i++) {
          await warmupCtx.solve(treeQuery, ['all'], { cache: false });
          console.error(`    warmup ${i + 1}/${WARMUP_RUNS}`);
        }
      } finally {
        warmupCmds.project.dispose();
      }
    }

    // Measurement loop. Flush partial results after each (project, scale) cell
    // so the in-flight JSON can be inspected with `jq` while the bench is
    // still running.
    for (const scale of scales) {
      const bundle = await loadFixture(root, project, scale);
      const cellStart = performance.now();
      await runFixture(bundle, allRuns);
      const elapsedMs = performance.now() - cellStart;
      cellTimings.push({
        project,
        scale,
        elapsedMs,
        completedAt: new Date().toISOString(),
      });
      console.error(
        `  cell project=${project} scale=${scale} elapsed=${(elapsedMs / 1000).toFixed(1)}s`,
      );
      const partial: BenchmarkResult = {
        feature: FEATURE,
        config: {
          projectPath: root,
          runs: RUNS_PER_POINT,
          warmupRuns: WARMUP_RUNS,
          scales: [...allScalesUnion].sort((a, b) => a - b),
        },
        runs: allRuns,
        cellTimings,
        timestamp: new Date().toISOString(),
        machine: machineName(),
      };
      await writeResults(partial, outputPath);
    }
  }

  const result: BenchmarkResult = {
    feature: FEATURE,
    config: {
      projectPath: root,
      runs: RUNS_PER_POINT,
      warmupRuns: WARMUP_RUNS,
      scales: [...allScalesUnion].sort((a, b) => a - b),
    },
    runs: allRuns,
    cellTimings,
    timestamp: new Date().toISOString(),
    machine: machineName(),
  };

  await writeResults(result, outputPath);
  console.error(
    `\nDone. ${allRuns.length} total runs written to ${outputPath}`,
  );
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
