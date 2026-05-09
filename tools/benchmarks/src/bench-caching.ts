import { CommandManager } from '@cyberismo/data-handler';
import { clearCache } from '@cyberismo/node-clingo';
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
const TEMPLATE = 'secdeva/templates/project';

async function main() {
  const allRuns: BenchmarkRun[] = [];
  const treeQuery = Handlebars.compile(lpFiles.queries.tree)({});

  // Warm-up at scale=1000
  console.error('Warming up native addon...');
  const warmupTmpDir = await scaleProject(projectPath, SCALE_MIN, TEMPLATE);
  const warmupCmds = await CommandManager.getInstance(warmupTmpDir);
  const clingo = warmupCmds.project.calculationEngine.context;
  for (let i = 0; i < WARMUP_RUNS; i++) {
    clearCache();
    await clingo.solve(treeQuery, ['all']);
  }

  for (let scale = SCALE_MIN; scale <= SCALE_MAX; scale += SCALE_STEP) {
    console.error(`\nScale: ${scale} cards`);

    const tmpDir =
      scale === SCALE_MIN
        ? warmupTmpDir
        : await scaleProject(projectPath, scale, TEMPLATE);
    let commands: Awaited<ReturnType<typeof CommandManager.getInstance>>;
    if (scale === SCALE_MIN) {
      commands = warmupCmds;
    } else {
      commands = await CommandManager.getInstance(tmpDir);
    }
    const ctx = commands.project.calculationEngine.context;

    const projectId = commands.project.projectPrefix;
    const cardCount = commands.project.cards().length;

    // ── Measurement 1: cold cache (clearCache before each solve) ────────────
    for (let run = 1; run <= RUNS_PER_POINT; run++) {
      clearCache();
      const r = await ctx.solve(treeQuery, ['all']);
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

    // ── Measurement 2: hit savings (miss then hit) ──────────────────────────
    // run = miss, run+1 = hit (back-to-back, no clearCache between them)
    for (let pair = 1; pair <= RUNS_PER_POINT; pair++) {
      // Miss run
      clearCache();
      const miss = await ctx.solve(treeQuery, ['all']);
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
      const hit = await ctx.solve(treeQuery, ['all']);
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
