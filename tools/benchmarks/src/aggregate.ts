import { readFile, writeFile } from 'node:fs/promises';
import { summarize, toCsv } from './utils.js';
import type { BenchmarkResult } from './types.js';

// Parse --output flag
let outputPath = 'results-combined.csv';
const rawArgs = process.argv.slice(2);
const outputIdx = rawArgs.indexOf('--output');
if (outputIdx !== -1) {
  outputPath = rawArgs[outputIdx + 1];
  rawArgs.splice(outputIdx, 2);
}
const inputPaths = rawArgs;

if (inputPaths.length === 0) {
  console.error(
    'Usage: tsx src/aggregate.ts [--output <csv-path>] <result1.json> [result2.json] ...',
  );
  process.exit(1);
}

async function main() {
  const allResults: BenchmarkResult[] = [];

  for (const path of inputPaths) {
    const content = await readFile(path, 'utf-8');
    allResults.push(JSON.parse(content) as BenchmarkResult);
  }

  // Print summary per feature/variant/query
  for (const result of allResults) {
    const byKey = new Map<string, typeof result.runs>();
    for (const run of result.runs) {
      const key = `${run.method}:${run.variant}:${run.query ?? '-'}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(run);
    }

    console.log(`\n=== ${result.feature} (${result.machine}) ===`);
    for (const [key, runs] of byKey) {
      const stats = summarize(runs);
      console.log(
        `  ${key}: mean=${(stats.mean / 1000).toFixed(1)}ms median=${(stats.median / 1000).toFixed(1)}ms stddev=${(stats.stddev / 1000).toFixed(1)}ms (n=${runs.length})`,
      );
    }
  }

  // Write combined CSV
  const allRuns = allResults.flatMap((r) => r.runs);
  await writeFile(outputPath, toCsv(allRuns));
  console.error(`\nCSV written to ${outputPath}`);
}

main().catch((error) => {
  console.error('Aggregation failed:', error);
  process.exit(1);
});
