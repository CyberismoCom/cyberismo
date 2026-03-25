import { CommandManager } from '@cyberismo/data-handler';
import { clearCache } from '@cyberismo/node-clingo';
import { lpFiles } from '@cyberismo/assets';
import Handlebars from 'handlebars';
import { scaleProject, cleanupScaledProject } from './card-scaler.js';
import { writeResults, machineName } from './utils.js';
import type { BenchmarkRun, BenchmarkResult } from './types.js';

const projectPath = process.argv[2];
const outputPath = process.argv[3] ?? 'results-threading.json';

if (!projectPath) {
  console.error(
    'Usage: tsx src/bench-threading.ts <project-path> [output-path]',
  );
  process.exit(1);
}

const RUNS = 5; // number of Promise.all batches
const WARMUP_RUNS = 3; // individual warm-up solves
const CONCURRENCY = 64; // simultaneous solves per batch
const SCALE = 200; // fixed card count
const TEMPLATE = 'secdeva/templates/project';

async function main() {
  console.error(`Scaling project to ${SCALE} cards...`);
  const tmpDir = await scaleProject(projectPath, SCALE, TEMPLATE);
  const commands = await CommandManager.getInstance(tmpDir);
  await commands.calculateCmd.generate();
  const clingo = commands.project.calculationEngine.context;

  const treeQuery = Handlebars.compile(lpFiles.queries.tree)({});
  const projectId = commands.project.projectPrefix;
  const cardCount = commands.project.cards().length;
  const allRuns: BenchmarkRun[] = [];

  // Warm-up
  console.error('Warming up...');
  for (let i = 0; i < WARMUP_RUNS; i++) {
    clearCache();
    await clingo.solve(treeQuery, ['all']);
  }

  // ── Variant: concurrent (Promise.all — thread pool) ────────────────────────
  console.error('\nRunning concurrent variant...');
  for (let run = 1; run <= RUNS; run++) {
    clearCache();
    const start = performance.now();
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        clingo.solve(treeQuery, ['all']),
      ),
    );
    const wallClockMs = performance.now() - start;

    const totalUs = Math.round(wallClockMs * 1000);
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
      });
    }
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
    console.error(
      `  concurrent run ${run}/${RUNS}: ${wallClockMs.toFixed(1)}ms for ${CONCURRENCY} solves`,
    );
  }

  // ── Variant: sequential (one-at-a-time awaits) ─────────────────────────────
  console.error('\nRunning sequential variant...');
  for (let run = 1; run <= RUNS; run++) {
    const start = performance.now();
    const results: Awaited<ReturnType<typeof clingo.solve>>[] = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      clearCache();
      results.push(await clingo.solve(treeQuery, ['all']));
    }
    const wallClockMs = performance.now() - start;

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
    console.error(
      `  sequential run ${run}/${RUNS}: ${wallClockMs.toFixed(1)}ms for ${CONCURRENCY} solves`,
    );
  }

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
  console.error(
    `\nDone. ${allRuns.length} total runs written to ${outputPath}`,
  );
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
