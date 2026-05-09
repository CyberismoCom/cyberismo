import { CommandManager, evaluateMacros } from '@cyberismo/data-handler';
import type { MacroGenerationContext } from '@cyberismo/data-handler';
import { clearCache } from '@cyberismo/node-clingo';
import type { ClingoContext } from '@cyberismo/node-clingo';
import { lpFiles } from '@cyberismo/assets';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import { solveBinary, solveWithPregrounding } from './binary-baseline.js';
import { scaleProject, cleanupScaledProject } from './card-scaler.js';
import { writeResults, machineName } from './utils.js';
import type { BenchmarkRun, BenchmarkResult } from './types.js';

// ── CLI args ────────────────────────────────────────────────────────────────
const projectPath = process.argv[2];
const outputPath = process.argv[3] ?? 'results-main.json';

if (!projectPath) {
  console.error('Usage: tsx src/bench-main.ts <project-path> [output-path]');
  process.exit(1);
}

// ── Constants ────────────────────────────────────────────────────────────────
const RUNS_PER_POINT = 10;
const WARMUP_RUNS = 3;
const SCALE_MIN = 1000;
const SCALE_MAX = 50000;
const SCALE_STEP = 1000;
const TEMPLATE = 'secdeva/templates/project';

const CARD_TYPES = {
  leafTask: 'base/cardTypes/annualTask',
  phase: 'secdeva/cardTypes/page',
  riskTask: 'base/cardTypes/quarterlyTask',
  projectRoot: 'secdeva/cardTypes/project',
} as const;

// ── Baseline LP files ────────────────────────────────────────────────────────
interface BaselineFiles {
  queryLanguage: string;
  utils: string;
  card: string;
}

async function loadBaselineFiles(): Promise<BaselineFiles> {
  const baselineDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '../baselines/pre-resultfield',
  );
  const [queryLanguage, utils, card] = await Promise.all([
    readFile(join(baselineDir, 'queryLanguage.lp'), 'utf-8'),
    readFile(join(baselineDir, 'utils.lp'), 'utf-8'),
    readFile(join(baselineDir, 'card.lp'), 'utf-8'),
  ]);
  return { queryLanguage, utils, card };
}

// ── Program swap helpers ──────────────────────────────────────────────────────
function swapToOldQL(clingo: ClingoContext, bf: BaselineFiles) {
  clingo.setProgram('queryLanguage', bf.queryLanguage, ['all']);
  clingo.setProgram('utils', bf.utils, ['all']);
}

function restoreCurrentQL(clingo: ClingoContext) {
  clingo.setProgram('queryLanguage', lpFiles.common.queryLanguage, ['all']);
  clingo.setProgram('utils', lpFiles.common.utils, ['all']);
}

// ── Query compilation ────────────────────────────────────────────────────────
function compileTreeQuery(): string {
  return Handlebars.compile(lpFiles.queries.tree)({});
}

function compileCardQuery(cardKey: string, currentQL: boolean, bf: BaselineFiles): string {
  const cardLp = currentQL ? lpFiles.queries.card : bf.card;
  return Handlebars.compile(cardLp)({ cardKey });
}

// ── BenchmarkRun factory ─────────────────────────────────────────────────────
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
    feature: 'main-scaling',
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
    feature: 'main-scaling',
    variant,
    query,
    project,
    cardCount,
    run,
    glueUs: 0,
    addUs: 0,
    groundUs: result.groundMs ? Math.round(result.groundMs * 1000) : 0,
    solveUs: result.solveMs ? Math.round(result.solveMs * 1000) : 0,
    totalUs: Math.round(result.wallClockMs * 1000),
    cacheHit: false,
    wallClockMs: result.wallClockMs,
  };
}

function makeIncrementalRun(
  query: string,
  cardCount: number,
  run: number,
  project: string,
  result: Awaited<ReturnType<typeof solveWithPregrounding>>,
): BenchmarkRun {
  return {
    method: 'pregrounding',
    feature: 'main-scaling',
    variant: 'incremental',
    query,
    project,
    cardCount,
    run,
    glueUs: Math.round(result.gringoMs * 1000),
    addUs: 0,
    groundUs: 0,
    solveUs: Math.round(result.clingoMs * 1000),
    totalUs: Math.round(result.totalMs * 1000),
    cacheHit: false,
    wallClockMs: result.totalMs,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const bf = await loadBaselineFiles();
  const allRuns: BenchmarkRun[] = [];

  // ── Warm-up: scale to 1000 and run 3 native solves ──────────────────────
  console.error('Warming up native addon...');
  const warmupTmpDir = await scaleProject(projectPath, SCALE_MIN, TEMPLATE);
  const warmupCmds = await CommandManager.getInstance(warmupTmpDir);
  const clingo = warmupCmds.project.calculationEngine.context;
  const treeQuery = compileTreeQuery();

  for (let i = 0; i < WARMUP_RUNS; i++) {
    clearCache();
    await clingo.solve(treeQuery, ['all']);
    console.error(`  warmup ${i + 1}/${WARMUP_RUNS}`);
  }

  // ── Measurement loop ─────────────────────────────────────────────────────
  for (let scale = SCALE_MIN; scale <= SCALE_MAX; scale += SCALE_STEP) {
    console.error(`\n=== Scale: ${scale} cards ===`);

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

    // Find target cards
    // cards() signature: cards(path?: string, details?: FetchCardDetails)
    // Pass undefined for path to use default; second arg controls what's populated.
    const allCards = commands.project.cards(undefined, { metadata: true });
    const leafCard = allCards.find(
      (c) => c.metadata?.cardType === CARD_TYPES.leafTask,
    );
    const phaseCard = allCards.find(
      (c) => c.metadata?.cardType === CARD_TYPES.phase,
    );
    const riskCard = allCards.find(
      (c) => c.metadata?.cardType === CARD_TYPES.riskTask,
    );
    const rootCard = allCards.find(
      (c) => c.metadata?.cardType === CARD_TYPES.projectRoot,
    );

    if (!leafCard || !phaseCard || !riskCard || !rootCard) {
      console.error(
        `  WARNING: Could not find all target card types at scale ${scale}`,
      );
      console.error(`  leaf=${leafCard?.key} phase=${phaseCard?.key} risk=${riskCard?.key} root=${rootCard?.key}`);
    }

    // Query content map
    const cardKeys = {
      'card-leaf-task': leafCard?.key ?? '',
      'card-phase': phaseCard?.key ?? '',
      'card-risk': riskCard?.key ?? '',
      'card-root': rootCard?.key ?? '',
    };

    // IMPORTANT: Each variant block must unconditionally set ALL its solver
    // flags at its start. Never rely on carry-over state from the previous
    // block — reordering variants must not silently change measurements.

    // ── VARIANT: baseline (binary + old QL) ────────────────────────────────
    console.error('  variant: baseline');
    swapToOldQL(ctx, bf);
    for (const [queryName, cardKey] of [
      ['tree', ''] as const,
      ...(['card-leaf-task', 'card-phase', 'card-risk', 'card-root'] as const).map(
        (q) => [q, cardKeys[q]] as [typeof q, string],
      ),
    ]) {
      const query =
        queryName === 'tree'
          ? treeQuery
          : compileCardQuery(cardKey, false, bf);
      const fullProgram = ctx.buildProgram(query, ['all']);
      for (let run = 1; run <= RUNS_PER_POINT; run++) {
        const r = await solveBinary(fullProgram);
        allRuns.push(makeBinaryRun('baseline', queryName, scale, run, projectId, r));
      }
      console.error(`    ${queryName}: ${RUNS_PER_POINT} runs done`);
    }
    restoreCurrentQL(ctx);

    // ── VARIANT: baseline+resultfield (binary + current QL) ───────────────
    console.error('  variant: baseline+resultfield');
    for (const [queryName, cardKey] of [
      ['tree', ''] as const,
      ...(['card-leaf-task', 'card-phase', 'card-risk', 'card-root'] as const).map(
        (q) => [q, cardKeys[q]] as [typeof q, string],
      ),
    ]) {
      const query =
        queryName === 'tree'
          ? treeQuery
          : Handlebars.compile(lpFiles.queries.card)({ cardKey });
      const fullProgram = ctx.buildProgram(query, ['all']);
      for (let run = 1; run <= RUNS_PER_POINT; run++) {
        const r = await solveBinary(fullProgram);
        allRuns.push(makeBinaryRun('baseline+resultfield', queryName, scale, run, projectId, r));
      }
      console.error(`    ${queryName}: ${RUNS_PER_POINT} runs done`);
    }

    // rendering reference for baseline+resultfield
    {
      const renderQuery = Handlebars.compile(lpFiles.queries.card)({
        cardKey: riskCard?.key ?? '',
      });
      const fullProgram = ctx.buildProgram(renderQuery, ['all']);
      for (let run = 1; run <= RUNS_PER_POINT; run++) {
        const r = await solveBinary(fullProgram);
        allRuns.push(makeBinaryRun('baseline+resultfield', 'rendering', scale, run, projectId, r));
      }
      console.error(`    rendering (reference): ${RUNS_PER_POINT} runs done`);
    }

    // ── VARIANT: c-api (native + old QL) ──────────────────────────────────
    console.error('  variant: c-api');
    swapToOldQL(ctx, bf);
    for (const [queryName, cardKey] of [
      ['tree', ''] as const,
      ...(['card-leaf-task', 'card-phase', 'card-risk', 'card-root'] as const).map(
        (q) => [q, cardKeys[q]] as [typeof q, string],
      ),
    ]) {
      const query =
        queryName === 'tree'
          ? treeQuery
          : compileCardQuery(cardKey, false, bf);
      for (let run = 1; run <= RUNS_PER_POINT; run++) {
        clearCache();
        const r = await ctx.solve(query, ['all']);
        allRuns.push(makeNativeRun('c-api', queryName, scale, run, projectId, r));
      }
      console.error(`    ${queryName}: ${RUNS_PER_POINT} runs done`);
    }
    restoreCurrentQL(ctx);

    // rendering for c-api
    {
      const cardsWithContent = commands.project.cards(undefined, { metadata: true, content: true });
      const riskCardContent = cardsWithContent.find(
        (c) => c.metadata?.cardType === CARD_TYPES.riskTask,
      );
      const ctx: MacroGenerationContext = {
        context: 'localApp',
        project: commands.project,
        mode: 'static',
        cardKey: riskCard?.key ?? '',
      };
      for (let run = 1; run <= RUNS_PER_POINT; run++) {
        clearCache();
        const start = performance.now();
        // Strip {{#graph}} blocks — graphviz rendering is not Clingo work and
        // its WASM can abort the process. The rendering benchmark measures
        // evaluateMacros pipeline cost (createCards + report macros), not SVG rendering.
        const contentNoGraph = (riskCardContent?.content ?? '').replace(
          /\{\{#graph\}\}[\s\S]*?\{\{\/graph\}\}/g,
          '',
        );
        await evaluateMacros(contentNoGraph, ctx);
        const wallClockMs = performance.now() - start;
        allRuns.push({
          method: 'native',
          feature: 'main-scaling',
          variant: 'c-api',
          query: 'rendering',
          project: projectId,
          cardCount: scale,
          run,
          glueUs: 0,
          addUs: 0,
          groundUs: 0,
          solveUs: 0,
          totalUs: Math.round(wallClockMs * 1000),
          cacheHit: false,
          wallClockMs,
        });
      }
      console.error(`    rendering: ${RUNS_PER_POINT} runs done`);
    }

    // ── VARIANT: c-api+resultfield (native + current QL) ──────────────────
    console.error('  variant: c-api+resultfield');
    for (const [queryName, cardKey] of [
      ['tree', ''] as const,
      ...(['card-leaf-task', 'card-phase', 'card-risk', 'card-root'] as const).map(
        (q) => [q, cardKeys[q]] as [typeof q, string],
      ),
    ]) {
      const query =
        queryName === 'tree'
          ? treeQuery
          : Handlebars.compile(lpFiles.queries.card)({ cardKey });
      for (let run = 1; run <= RUNS_PER_POINT; run++) {
        clearCache();
        const r = await ctx.solve(query, ['all']);
        allRuns.push(makeNativeRun('c-api+resultfield', queryName, scale, run, projectId, r));
      }
      console.error(`    ${queryName}: ${RUNS_PER_POINT} runs done`);
    }

    // Note: no rendering query for c-api+resultfield — rendering (evaluateMacros)
    // is only measured for c-api and c-api+aspif (per spec). baseline+resultfield
    // provides a wall-clock reference via solveBinary.

    // ── VARIANT: c-api+aspif (native + current QL + pre-parsing) ──────────
    console.error('  variant: c-api+aspif');
    for (const [queryName, cardKey] of [
      ['tree', ''] as const,
      ...(['card-leaf-task', 'card-phase', 'card-risk', 'card-root'] as const).map(
        (q) => [q, cardKeys[q]] as [typeof q, string],
      ),
    ]) {
      const query =
        queryName === 'tree'
          ? treeQuery
          : Handlebars.compile(lpFiles.queries.card)({ cardKey });
      for (let run = 1; run <= RUNS_PER_POINT; run++) {
        clearCache();
        const r = await ctx.solve(query, ['all']);
        allRuns.push(makeNativeRun('c-api+aspif', queryName, scale, run, projectId, r));
      }
      console.error(`    ${queryName}: ${RUNS_PER_POINT} runs done`);
    }

    // rendering for c-api+aspif
    {
      const cardsWithContent = commands.project.cards(undefined, { metadata: true, content: true });
      const riskCardContent = cardsWithContent.find(
        (c) => c.metadata?.cardType === CARD_TYPES.riskTask,
      );
      const ctx: MacroGenerationContext = {
        context: 'localApp',
        project: commands.project,
        mode: 'static',
        cardKey: riskCard?.key ?? '',
      };
      for (let run = 1; run <= RUNS_PER_POINT; run++) {
        clearCache();
        const start = performance.now();
        const contentNoGraph = (riskCardContent?.content ?? '').replace(
          /\{\{#graph\}\}[\s\S]*?\{\{\/graph\}\}/g,
          '',
        );
        await evaluateMacros(contentNoGraph, ctx);
        const wallClockMs = performance.now() - start;
        allRuns.push({
          method: 'native',
          feature: 'main-scaling',
          variant: 'c-api+aspif',
          query: 'rendering',
          project: projectId,
          cardCount: scale,
          run,
          glueUs: 0,
          addUs: 0,
          groundUs: 0,
          solveUs: 0,
          totalUs: Math.round(wallClockMs * 1000),
          cacheHit: false,
          wallClockMs,
        });
      }
      console.error(`    rendering: ${RUNS_PER_POINT} runs done`);
    }

    // ── VARIANT: incremental (gringo→ASPIF→clingo) ─────────────────────────
    // Build base without queryLanguage/utils (they stay in the query step)
    console.error('  variant: incremental');
    ctx.removeProgram('queryLanguage');
    ctx.removeProgram('utils');
    let baseProgram: string;
    try {
      baseProgram = ctx.buildProgram('', ['all']);
    } finally {
      restoreCurrentQL(ctx); // always restore, even if buildProgram throws
    }

    for (const [queryName, cardKey] of [
      ['tree', ''] as const,
      ...(['card-leaf-task', 'card-phase', 'card-risk', 'card-root'] as const).map(
        (q) => [q, cardKeys[q]] as [typeof q, string],
      ),
    ]) {
      const specificQuery =
        queryName === 'tree'
          ? treeQuery
          : Handlebars.compile(lpFiles.queries.card)({ cardKey });
      const queryProgram =
        lpFiles.common.queryLanguage + '\n' + lpFiles.common.utils + '\n' + specificQuery;
      for (let run = 1; run <= RUNS_PER_POINT; run++) {
        const r = await solveWithPregrounding(baseProgram, queryProgram);
        allRuns.push(makeIncrementalRun(queryName, scale, run, projectId, r));
      }
      console.error(`    ${queryName}: ${RUNS_PER_POINT} runs done`);
    }

    if (scale > SCALE_MIN) {
      await cleanupScaledProject(tmpDir);
    }
  }

  // Cleanup warm-up dir (was used for scale=1000)
  await cleanupScaledProject(warmupTmpDir);

  const result: BenchmarkResult = {
    feature: 'main-scaling',
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

  await writeResults(result, outputPath);
  console.error(`\nDone. ${allRuns.length} total runs written to ${outputPath}`);
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
