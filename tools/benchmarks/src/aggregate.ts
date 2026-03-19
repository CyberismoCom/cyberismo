import { readFile, writeFile } from 'node:fs/promises';
import { summarize, toCsv } from './utils.js';
import type { BenchmarkResult } from './types.js';

const inputPaths = process.argv.slice(2);

if (inputPaths.length === 0) {
  console.error(
    'Usage: tsx src/aggregate.ts <result1.json> [result2.json] ...',
  );
  process.exit(1);
}

async function main() {
  const allResults: BenchmarkResult[] = [];

  for (const path of inputPaths) {
    const content = await readFile(path, 'utf-8');
    allResults.push(JSON.parse(content) as BenchmarkResult);
  }

  // Print summary per feature/variant
  for (const result of allResults) {
    const byVariant = new Map<string, typeof result.runs>();
    for (const run of result.runs) {
      const key = `${run.method}:${run.variant}`;
      if (!byVariant.has(key)) byVariant.set(key, []);
      byVariant.get(key)!.push(run);
    }

    console.log(`\n=== ${result.feature} (${result.machine}) ===`);
    for (const [key, runs] of byVariant) {
      const stats = summarize(runs);
      console.log(
        `  ${key}: mean=${(stats.mean / 1000).toFixed(1)}ms median=${(stats.median / 1000).toFixed(1)}ms stddev=${(stats.stddev / 1000).toFixed(1)}ms (n=${runs.length})`,
      );
    }
  }

  // Write combined CSV
  const allRuns = allResults.flatMap((r) => r.runs);
  const csvPath = 'results-combined.csv';
  await writeFile(csvPath, toCsv(allRuns));
  console.error(`\nCSV written to ${csvPath}`);
}

main().catch((error) => {
  console.error('Aggregation failed:', error);
  process.exit(1);
});
