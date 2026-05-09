/**
 * Threading benchmark — consumes pre-generated fixtures.
 *
 * For every project under `<fixturesDir>/`, requires a fixture at scale=200
 * (`<fixtures-dir>/<project>/200/`). If the project does not have that scale
 * generated, it is skipped with a clear stderr warning.
 *
 * Generation note: scale 200 is BELOW the fixture generator's default
 * `--scale-min` (1000). Generate with
 *   `pnpm bench:gen-fixtures <fixturesDir> --scale-min 200 --scale-max 200`
 * for threading-only fixtures, or `--scale-min 200` for a sweep that also
 * includes 200.
 */
import { CommandManager } from '@cyberismo/data-handler';
import { clearCache } from '@cyberismo/node-clingo';
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
const SCALE = 200; // fixed card count for this benchmark
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
    if (!(await hasScale(root, project, SCALE))) {
      console.error(
        `WARNING: project '${project}' has no scale=${SCALE} fixture (threading benchmark requires it). Skipping.\n` +
          `         Re-run: pnpm bench:gen-fixtures ${fixturesDir} --project ${project} --scale-min ${SCALE} --scale-max ${SCALE}`,
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
        clearCache();
        await clingo.solve(treeQuery, ['all']);
      }

      // ── Variant: concurrent (Promise.all — thread pool) ─────────────────
      console.error('  running concurrent variant...');
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
            feature: FEATURE,
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
          feature: FEATURE,
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
          `    concurrent run ${run}/${RUNS}: ${wallClockMs.toFixed(1)}ms for ${CONCURRENCY} solves`,
        );
      }

      // ── Variant: sequential (one-at-a-time awaits) ──────────────────────
      console.error('  running sequential variant...');
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
            feature: FEATURE,
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
          feature: FEATURE,
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
          `    sequential run ${run}/${RUNS}: ${wallClockMs.toFixed(1)}ms for ${CONCURRENCY} solves`,
        );
      }
    } finally {
      commands.project.dispose();
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
