/**
 * Caching benchmark — consumes pre-generated fixtures.
 *
 * For every project under `<fixturesDir>/`, for every scale, runs three
 * variants on the tree query:
 *
 *   - cache-disabled  — `{ cache: false }` per-call option (no hash, no
 *                       lookup, no store). RUNS_PER_POINT consecutive runs
 *                       with `clearCache()` before each (parity with the
 *                       cache-miss measurement).
 *   - cache-miss      — `clearCache()` then `solve()` (hash + miss + store).
 *   - cache-hit       — `solve()` immediately after a miss (hash + hit).
 */
import { CommandManager } from '@cyberismo/data-handler';
import { clearCache } from '@cyberismo/node-clingo';
import { resolve } from 'node:path';
import { listProjects, listScales, loadFixture } from './fixture-loader.js';
import { writeResults, machineName } from './utils.js';
import type { BenchmarkRun, BenchmarkResult, CellTiming } from './types.js';

const fixturesDir = process.argv[2];
const outputPath = process.argv[3] ?? 'results-caching.json';

if (!fixturesDir) {
  console.error('Usage: tsx src/bench-caching.ts <fixtures-dir> [output-path]');
  process.exit(1);
}

const RUNS_PER_POINT = 3;
const WARMUP_RUNS = 3;
const FEATURE = 'caching';

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

    // Warm-up: 3 native solves of tree at the smallest scale per project
    const warmupBundle = await loadFixture(root, project, scales[0]);
    {
      console.error(
        `  warmup: ${WARMUP_RUNS} solves of tree at scale=${scales[0]}`,
      );
      const warmupCmds = await CommandManager.getInstance(
        warmupBundle.projectDir,
      );
      const warmupCtx = warmupCmds.project.calculationEngine.context;
      try {
        for (let i = 0; i < WARMUP_RUNS; i++) {
          clearCache();
          await warmupCtx.solve(warmupBundle.queries.tree, ['all']);
        }
      } finally {
        warmupCmds.project.dispose();
      }
    }

    for (const scale of scales) {
      console.error(`\n  project=${project} scale=${scale}`);
      const cellStart = performance.now();
      const bundle = await loadFixture(root, project, scale);
      const commands = await CommandManager.getInstance(bundle.projectDir);
      const ctx = commands.project.calculationEngine.context;
      const projectId = commands.project.projectPrefix;
      const cardCount = bundle.meta.cardCount;
      const treeQuery = bundle.queries.tree;

      try {
        // Per-cell warmup: a few throwaway solves through each path so the
        // first measurement isn't contaminated by JIT / addon-state setup.
        // Without this, cache-disabled (which runs first in each cell) has
        // measurements that include first-solve cost while cache-miss gets
        // the warm path.
        const VARIANT_WARMUP = 2;
        for (let i = 0; i < VARIANT_WARMUP; i++) {
          await ctx.solve(treeQuery, ['all'], { cache: false });
        }
        clearCache();
        for (let i = 0; i < VARIANT_WARMUP; i++) {
          await ctx.solve(treeQuery, ['all']);
        }

        // ── cache-disabled: bypass cache via { cache: false } ─────────────
        for (let run = 1; run <= RUNS_PER_POINT; run++) {
          clearCache();
          const r = await ctx.solve(treeQuery, ['all'], { cache: false });
          const s = r.stats;
          allRuns.push({
            method: 'native',
            feature: FEATURE,
            variant: 'cache-disabled',
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

        // ── cache-miss followed immediately by cache-hit ──────────────────
        for (let pair = 1; pair <= RUNS_PER_POINT; pair++) {
          clearCache();
          const miss = await ctx.solve(treeQuery, ['all']);
          const ms = miss.stats;
          allRuns.push({
            method: 'native',
            feature: FEATURE,
            variant: 'cache-miss',
            query: 'tree',
            project: projectId,
            cardCount,
            run: pair,
            glueUs: ms.glue,
            addUs: ms.add,
            groundUs: ms.ground,
            solveUs: ms.solve,
            totalUs: ms.glue + ms.add + ms.ground + ms.solve,
            cacheHit: ms.cacheHit,
          });

          const hit = await ctx.solve(treeQuery, ['all']);
          const hs = hit.stats;
          allRuns.push({
            method: 'native',
            feature: FEATURE,
            variant: 'cache-hit',
            query: 'tree',
            project: projectId,
            cardCount,
            run: pair,
            glueUs: hs.glue,
            addUs: hs.add,
            groundUs: hs.ground,
            solveUs: hs.solve,
            totalUs: hs.glue + hs.add + hs.ground + hs.solve,
            cacheHit: hs.cacheHit,
          });
        }

        console.error(`    done`);
      } finally {
        commands.project.dispose();
      }

      const elapsedMs = performance.now() - cellStart;
      cellTimings.push({
        project,
        scale,
        elapsedMs,
        completedAt: new Date().toISOString(),
      });
      console.error(
        `    cell elapsed=${(elapsedMs / 1000).toFixed(1)}s`,
      );

      // Flush partial results after each cell so the JSON can be inspected
      // with `jq` / plot.py while the bench is still running.
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

  const benchResult: BenchmarkResult = {
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

  await writeResults(benchResult, outputPath);
  console.error(
    `\nDone. ${allRuns.length} total runs written to ${outputPath}`,
  );
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
