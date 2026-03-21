import { CommandManager } from '@cyberismo/data-handler';
import {
  solve,
  setCacheEnabled,
  setAsyncSolve,
  setPreParsing,
} from '@cyberismo/node-clingo';
import { lpFiles } from '@cyberismo/assets';
import Handlebars from 'handlebars';
import { scaleProject, cleanupScaledProject } from './card-scaler.js';
import { writeResults, machineName } from './utils.js';
import type { BenchmarkRun, BenchmarkResult } from './types.js';

const projectPath = process.argv[2];
const outputPath = process.argv[3] ?? 'results-threading.json';

if (!projectPath) {
  console.error('Usage: tsx src/bench-threading.ts <project-path> [output-path]');
  process.exit(1);
}

const RUNS = 10;           // number of Promise.all batches
const WARMUP_RUNS = 3;     // individual warm-up solves
const CONCURRENCY = 64;     // simultaneous solves per batch
const SCALE = 2000;       // fixed card count
const TEMPLATE = 'secdeva/templates/project';

async function main() {
  console.error(`Scaling project to ${SCALE} cards...`);
  const tmpDir = await scaleProject(projectPath, SCALE, TEMPLATE);
  const commands = await CommandManager.getInstance(tmpDir);
  setPreParsing(true);
  await commands.calculateCmd.generate();
  setPreParsing(false);

  const treeQuery = Handlebars.compile(lpFiles.queries.tree)({});
  const projectId = commands.project.projectPrefix;
  const cardCount = commands.project.cards().length;
  const allRuns: BenchmarkRun[] = [];

  // Warm-up
  console.error('Warming up...');
  setCacheEnabled(false);
  for (let i = 0; i < WARMUP_RUNS; i++) {
    await solve(treeQuery, ['all']);
  }
  setCacheEnabled(true);

  // ── Variant: async (default — worker thread pool) ─────────────────────────
  console.error('\nRunning async variant...');
  setAsyncSolve(true);
  for (let run = 1; run <= RUNS; run++) {
    setCacheEnabled(false); // force each to actually solve
    const start = performance.now();
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => solve(treeQuery, ['all'])),
    );
    const wallClockMs = performance.now() - start;
    setCacheEnabled(true);

    // Record one aggregate run entry (totalUs = total wall clock for all CONCURRENCY solves)
    const totalUs = Math.round(wallClockMs * 1000);
    // Also record per-solve stats from the results
    for (let i = 0; i < results.length; i++) {
      const s = results[i].stats;
      allRuns.push({
        method: 'native',
        feature: 'threading',
        variant: 'async',
        project: projectId,
        cardCount,
        run,
        glueUs: s.glue,
        addUs: s.add,
        groundUs: s.ground,
        solveUs: s.solve,
        totalUs: s.glue + s.add + s.ground + s.solve,
        cacheHit: s.cacheHit,
        // wallClockMs intentionally omitted: overlapping async solves mean
        // per-solve wall-clock is not meaningful. Use totalUs for individual timing.
      });
    }
    // Batch entry: total wall-clock for all CONCURRENCY solves completing
    allRuns.push({
      method: 'native',
      feature: 'threading',
      variant: 'async-batch',
      project: projectId,
      cardCount,
      run,
      glueUs: 0,
      addUs: 0,
      groundUs: 0,
      solveUs: 0,
      totalUs,
      cacheHit: false,
      wallClockMs,
    });
    console.error(`  async run ${run}/${RUNS}: ${wallClockMs.toFixed(1)}ms for ${CONCURRENCY} solves`);
  }

  // ── Variant: sync (blocks event loop) ────────────────────────────────────
  console.error('\nRunning sync variant...');
  setAsyncSolve(false);
  for (let run = 1; run <= RUNS; run++) {
    setCacheEnabled(false);
    const start = performance.now();
    // With sync solving, Promise.all still awaits each promise but the solver
    // blocks the event loop, so solves run sequentially
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => solve(treeQuery, ['all'])),
    );
    const wallClockMs = performance.now() - start;
    setCacheEnabled(true);

    const totalUs = Math.round(wallClockMs * 1000);
    for (let i = 0; i < results.length; i++) {
      const s = results[i].stats;
      allRuns.push({
        method: 'native',
        feature: 'threading',
        variant: 'sync',
        project: projectId,
        cardCount,
        run,
        glueUs: s.glue,
        addUs: s.add,
        groundUs: s.ground,
        solveUs: s.solve,
        totalUs: s.glue + s.add + s.ground + s.solve,
        cacheHit: s.cacheHit,
        // wallClockMs omitted on per-solve sync entries — sequential solves
        // means wall-clock equals totalUs; omitting avoids misleading duplication.
      });
    }
    allRuns.push({
      method: 'native',
      feature: 'threading',
      variant: 'sync-batch',
      project: projectId,
      cardCount,
      run,
      glueUs: 0,
      addUs: 0,
      groundUs: 0,
      solveUs: 0,
      totalUs,
      cacheHit: false,
      wallClockMs,
    });
    console.error(`  sync run ${run}/${RUNS}: ${wallClockMs.toFixed(1)}ms for ${CONCURRENCY} solves`);
  }

  // Restore defaults
  setAsyncSolve(true);
  setCacheEnabled(true);
  setPreParsing(false);
  await cleanupScaledProject(tmpDir);

  const benchResult: BenchmarkResult = {
    feature: 'threading',
    config: {
      projectPath,
      runs: RUNS,
      warmupRuns: WARMUP_RUNS,
      template: TEMPLATE,
    },
    runs: allRuns,
    timestamp: new Date().toISOString(),
    machine: machineName(),
  };

  await writeResults(benchResult, outputPath);
  console.error(`\nDone. ${allRuns.length} total runs written to ${outputPath}`);
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
