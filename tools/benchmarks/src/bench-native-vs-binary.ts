// tools/benchmarks/src/bench-native-vs-binary.ts
import { CommandManager } from '@cyberismo/data-handler';
import { clearCache } from '@cyberismo/node-clingo';
import { lpFiles } from '@cyberismo/assets';
import Handlebars from 'handlebars';
import { solveBinary } from './binary-baseline.js';
import { writeResults, machineName } from './utils.js';
import type { BenchmarkRun, BenchmarkResult } from './types.js';

const projectPath = process.argv[2];
const outputPath = process.argv[3] ?? 'results-native-vs-binary.json';
const runs = parseInt(process.argv[4] ?? '10', 10);
const warmupRuns = 3;

if (!projectPath) {
  console.error(
    'Usage: tsx src/bench-native-vs-binary.ts <project-path> [output-path] [runs]',
  );
  process.exit(1);
}

async function main() {
  const commands = await CommandManager.getInstance(projectPath);
  const clingo = commands.project.calculationEngine.context;

  // Compile the Handlebars query template (no options = full tree query)
  const queryContent = Handlebars.compile(lpFiles.queries.tree)({});
  const fullProgram = clingo.buildProgram(queryContent, ['all']);
  const cardCount = commands.project.cards().length;
  const benchRuns: BenchmarkRun[] = [];

  // Warm-up native addon
  for (let i = 0; i < warmupRuns; i++) {
    clearCache();
    await clingo.solve(queryContent, ['all']);
  }

  // Native addon benchmark
  for (let i = 1; i <= runs; i++) {
    clearCache();
    const result = await clingo.solve(queryContent, ['all']);
    const s = result.stats;
    benchRuns.push({
      method: 'native',
      feature: 'native-vs-binary',
      variant: 'treatment',
      project: commands.project.projectPrefix,
      cardCount,
      run: i,
      glueUs: s.glue,
      addUs: s.add,
      groundUs: s.ground,
      solveUs: s.solve,
      totalUs: s.glue + s.add + s.ground + s.solve,
      cacheHit: s.cacheHit,
    });
    console.error(`  native run ${i}/${runs}`);
  }

  // Binary clingo benchmark
  for (let i = 1; i <= runs; i++) {
    const result = await solveBinary(fullProgram, true);
    benchRuns.push({
      method: 'binary',
      feature: 'native-vs-binary',
      variant: 'baseline',
      project: commands.project.projectPrefix,
      cardCount,
      run: i,
      glueUs: 0,
      addUs: 0,
      groundUs: result.groundMs ? Math.round(result.groundMs * 1000) : 0,
      solveUs: result.solveMs ? Math.round(result.solveMs * 1000) : 0,
      totalUs: Math.round(result.wallClockMs * 1000),
      cacheHit: false,
      wallClockMs: result.wallClockMs,
    });
    console.error(`  binary run ${i}/${runs}`);
  }

  const benchResult: BenchmarkResult = {
    feature: 'native-vs-binary',
    config: { projectPath, runs, warmupRuns },
    runs: benchRuns,
    timestamp: new Date().toISOString(),
    machine: machineName(),
  };

  await writeResults(benchResult, outputPath);
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
