import { hostname } from 'node:os';
import { writeFile } from 'node:fs/promises';
import type { BenchmarkResult, BenchmarkRun } from './types.js';

export function summarize(runs: BenchmarkRun[]): {
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  ci95: number;
} {
  const values = runs.map((r) => r.totalUs);
  values.sort((a, b) => a - b);
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const median =
    n % 2 === 0
      ? (values[n / 2 - 1] + values[n / 2]) / 2
      : values[Math.floor(n / 2)];
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
  const stddev = Math.sqrt(variance);
  const ci95 = (1.96 * stddev) / Math.sqrt(n);
  return { mean, median, stddev, min: values[0], max: values[n - 1], ci95 };
}

export async function writeResults(
  result: BenchmarkResult,
  outputPath: string,
): Promise<void> {
  await writeFile(outputPath, JSON.stringify(result, null, 2));
  console.error(`Results written to ${outputPath}`);
}

export function toCsv(runs: BenchmarkRun[]): string {
  const header =
    'method,feature,variant,query,project,cardCount,run,glueUs,addUs,groundUs,solveUs,totalUs,cacheHit,wallClockMs';
  const rows = runs.map(
    (r) =>
      `${r.method},${r.feature},${r.variant},${r.query ?? ''},${r.project},${r.cardCount},${r.run},${r.glueUs},${r.addUs},${r.groundUs},${r.solveUs},${r.totalUs},${r.cacheHit},${r.wallClockMs ?? ''}`,
  );
  return [header, ...rows].join('\n') + '\n';
}

export function machineName(): string {
  return hostname();
}
