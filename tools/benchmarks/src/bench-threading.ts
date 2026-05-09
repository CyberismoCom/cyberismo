/**
 * Threading benchmark — consumes pre-generated fixtures. Iterates every
 * (project, scale) cell in the fixture tree, runs RUNS batches of
 * CONCURRENCY concurrent vs sequential solves, records both per-solve
 * latency and per-batch wall-clock.
 */
import { CommandManager } from '@cyberismo/data-handler';
import { resolve } from 'node:path';
import { listProjects, listScales, loadFixture } from './fixture-loader.js';
import { writeResults, machineName } from './utils.js';
import type { BenchmarkRun, BenchmarkResult } from './types.js';

const fixturesDir = process.argv[2];
const outputPath = process.argv[3] ?? 'results-threading.json';

if (!fixturesDir) {
  console.error(
    'Usage: tsx src/bench-threading.ts <fixtures-dir> [output-path]',
  );
  process.exit(1);
}

const RUNS = 5; // number of Promise.all batches
const WARMUP_RUNS = 3; // individual warm-up solves
const CONCURRENCY = 64; // simultaneous solves per batch
const FEATURE = 'threading';

async function main() {
  const root = resolve(fixturesDir);
  const projects = await listProjects(root);
  if (projects.length === 0) {
    console.error(`No project directories found under ${root}.`);
    process.exit(1);
  }

  const allRuns: BenchmarkRun[] = [];

  for (const project of projects) {
    const scales = await listScales(root, project);
    if (scales.length === 0) {
      console.error(`  project=${project}: no scales found, skipping`);
      continue;
    }
    for (const SCALE of scales) {
    console.error(`\n=== project=${project} scale=${SCALE} ===`);
    const bundle = await loadFixture(root, project, SCALE);
    const commands = await CommandManager.getInstance(bundle.projectDir);
    const clingo = commands.project.calculationEngine.context;

    const treeQuery = bundle.queries.tree;
    const projectId = commands.project.projectPrefix;
    const cardCount = bundle.meta.cardCount;

    try {
      // Warm-up
      console.error('  warming up...');
      for (let i = 0; i < WARMUP_RUNS; i++) {
        await clingo.solve(treeQuery, ['all'], { cache: false });
      }

      // ── Variant: concurrent (Promise.all — thread pool) ─────────────────
      console.error('  running concurrent variant...');
      for (let run = 1; run <= RUNS; run++) {
        const start = performance.now();
        const results = await Promise.all(
          Array.from({ length: CONCURRENCY }, () =>
            clingo.solve(treeQuery, ['all'], { cache: false }),
          ),
        );
        const wallClockMs = performance.now() - start;

        const totalUs = Math.round(wallClockMs * 1000);
        for (let i = 0; i < results.length; i++) {
          const s = results[i].stats;
          allRuns.push({
            method: 'native',
            feature: FEATURE,
            variant: 'async',
            query: 'tree',
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
          feature: FEATURE,
          variant: 'async-batch',
          query: 'tree',
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
          `    concurrent run ${run}/${RUNS}: ${wallClockMs.toFixed(1)}ms for ${CONCURRENCY} solves`,
        );
      }

      // ── Variant: sequential (one-at-a-time awaits) ──────────────────────
      console.error('  running sequential variant...');
      for (let run = 1; run <= RUNS; run++) {
        const start = performance.now();
        const results: Awaited<ReturnType<typeof clingo.solve>>[] = [];
        for (let i = 0; i < CONCURRENCY; i++) {
          results.push(
            await clingo.solve(treeQuery, ['all'], { cache: false }),
          );
        }
        const wallClockMs = performance.now() - start;

        const totalUs = Math.round(wallClockMs * 1000);
        for (let i = 0; i < results.length; i++) {
          const s = results[i].stats;
          allRuns.push({
            method: 'native',
            feature: FEATURE,
            variant: 'sync',
            query: 'tree',
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
          feature: FEATURE,
          variant: 'sync-batch',
          query: 'tree',
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
          `    sequential run ${run}/${RUNS}: ${wallClockMs.toFixed(1)}ms for ${CONCURRENCY} solves`,
        );
      }
    } finally {
      commands.project.dispose();
    }
    }
  }

  const benchResult: BenchmarkResult = {
    feature: FEATURE,
    config: {
      projectPath: resolve(fixturesDir),
      runs: RUNS,
      warmupRuns: WARMUP_RUNS,
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
