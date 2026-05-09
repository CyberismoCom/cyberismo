/**
 * Threading benchmark — consumes pre-generated fixtures across a small
 * set of scales so the per-cell async-vs-sync delta can be observed as
 * project size grows. Scales are chosen as a coarse spread (small, mid,
 * large-ish) rather than the full sweep — the goal is "does the
 * threading speedup hold at scale?", not high-resolution scaling.
 *
 * Each project must have fixtures at every SCALES entry; missing fixtures
 * are skipped with a stderr warning.
 */
import { CommandManager } from '@cyberismo/data-handler';
import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { listProjects, loadFixture } from './fixture-loader.js';
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
const SCALES = [200, 1000, 5000, 25000]; // coarse spread; understanding-not-precision
const FEATURE = 'threading';

async function hasScale(
  root: string,
  project: string,
  scale: number,
): Promise<boolean> {
  try {
    const s = await stat(join(root, project, String(scale)));
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function main() {
  const root = resolve(fixturesDir);
  const projects = await listProjects(root);
  if (projects.length === 0) {
    console.error(`No project directories found under ${root}.`);
    process.exit(1);
  }

  const allRuns: BenchmarkRun[] = [];

  for (const project of projects) {
    for (const SCALE of SCALES) {
    if (!(await hasScale(root, project, SCALE))) {
      console.error(
        `WARNING: project '${project}' has no scale=${SCALE} fixture — skipping that cell.`,
      );
      continue;
    }

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
