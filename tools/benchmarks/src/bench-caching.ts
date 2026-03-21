import { CommandManager } from '@cyberismo/data-handler';
import {
  solve,
  clearCache,
  setCacheEnabled,
} from '@cyberismo/node-clingo';
import { lpFiles } from '@cyberismo/assets';
import Handlebars from 'handlebars';
import { scaleProject, cleanupScaledProject } from './card-scaler.js';
import { writeResults, machineName } from './utils.js';
import type { BenchmarkRun, BenchmarkResult } from './types.js';

const projectPath = process.argv[2];
const outputPath = process.argv[3] ?? 'results-caching.json';

if (!projectPath) {
  console.error('Usage: tsx src/bench-caching.ts <project-path> [output-path]');
  process.exit(1);
}

const RUNS_PER_POINT = 10;
const WARMUP_RUNS = 3;
const SCALE_MIN = 1000;
const SCALE_MAX = 50000;
const SCALE_STEP = 1000;
const TEMPLATE = 'project';

async function main() {
  const allRuns: BenchmarkRun[] = [];
  const treeQuery = Handlebars.compile(lpFiles.queries.tree)({});

  // Warm-up at scale=1000
  console.error('Warming up native addon...');
  const warmupTmpDir = await scaleProject(projectPath, SCALE_MIN, TEMPLATE);
  const warmupCmds = await CommandManager.getInstance(warmupTmpDir);
  await warmupCmds.calculateCmd.generate();
  setCacheEnabled(false);
  for (let i = 0; i < WARMUP_RUNS; i++) {
    await solve(treeQuery, ['all']);
  }
  setCacheEnabled(true);

  for (let scale = SCALE_MIN; scale <= SCALE_MAX; scale += SCALE_STEP) {
    console.error(`\nScale: ${scale} cards`);

    const tmpDir =
      scale === SCALE_MIN
        ? warmupTmpDir
        : await scaleProject(projectPath, scale, TEMPLATE);
    const commands =
      scale === SCALE_MIN
        ? warmupCmds
        : await CommandManager.getInstance(tmpDir);
    if (scale > SCALE_MIN) await commands.calculateCmd.generate();

    const projectId = commands.project.projectPrefix;
    const cardCount = commands.project.cards().length;

    // ── Measurement 1: miss overhead (cache-enabled vs cache-disabled) ──────
    // cache-enabled, cold (always misses — clearCache before each)
    setCacheEnabled(true);
    for (let run = 1; run <= RUNS_PER_POINT; run++) {
      clearCache();
      const r = await solve(treeQuery, ['all']);
      const s = r.stats;
      allRuns.push({
        method: 'native',
        feature: 'caching',
        variant: 'cache-enabled',
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

    // cache-disabled (no lookup overhead at all)
    setCacheEnabled(false);
    for (let run = 1; run <= RUNS_PER_POINT; run++) {
      const r = await solve(treeQuery, ['all']);
      const s = r.stats;
      allRuns.push({
        method: 'native',
        feature: 'caching',
        variant: 'cache-disabled',
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
    setCacheEnabled(true);

    // ── Measurement 2: hit savings (miss then hit) ──────────────────────────
    // run = miss, run+1 = hit (back-to-back, no clearCache between them)
    for (let pair = 1; pair <= RUNS_PER_POINT; pair++) {
      // Miss run
      clearCache();
      const miss = await solve(treeQuery, ['all']);
      const ms = miss.stats;
      allRuns.push({
        method: 'native',
        feature: 'caching',
        variant: 'cache-miss',
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

      // Hit run (same query, no clearCache)
      const hit = await solve(treeQuery, ['all']);
      const hs = hit.stats;
      allRuns.push({
        method: 'native',
        feature: 'caching',
        variant: 'cache-hit',
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

    console.error(`  done`);

    if (scale > SCALE_MIN) await cleanupScaledProject(tmpDir);
  }

  await cleanupScaledProject(warmupTmpDir);

  const benchResult: BenchmarkResult = {
    feature: 'caching',
    config: {
      projectPath,
      runs: RUNS_PER_POINT,
      warmupRuns: WARMUP_RUNS,
      scales: Array.from(
        { length: (SCALE_MAX - SCALE_MIN) / SCALE_STEP + 1 },
        (_, i) => SCALE_MIN + i * SCALE_STEP,
      ),
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
