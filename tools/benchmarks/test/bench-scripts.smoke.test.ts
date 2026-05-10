/**
 * Smoke tests for the three benchmark scripts (`bench-main`, `bench-caching`,
 * `bench-threading`). Generates a tiny one-scale fixture in `beforeAll` and
 * runs each script against it via tsx. Skipped entirely if `gringo` is not
 * available — same pattern as `generate-fixtures.test.ts`.
 *
 * The intent here is to prove that the scripts:
 *   - load fixtures, find projects/scales,
 *   - emit a `BenchmarkResult` JSON,
 *   - produce >0 BenchmarkRun records of the expected shape.
 *
 * We do NOT validate timing accuracy or run all variants — we just check the
 * end-to-end plumbing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { generateFixtures } from '../src/generate-fixtures.js';
import type { BenchmarkResult } from '../src/types.js';

const execFileAsync = promisify(execFile);

const SMOKE_PROJECT = 'cyberismo-docs';
const MAIN_SCALE = 1000;
const THREADING_SCALE = 200;

async function gringoAvailable(): Promise<boolean> {
  try {
    await execFileAsync('gringo', ['--version']);
    return true;
  } catch {
    return false;
  }
}

const hasGringo = await gringoAvailable();

if (!hasGringo) {
  console.warn(
    '[bench-scripts.smoke.test] gringo not available on PATH — skipping suite',
  );
}

const benchDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(benchDir, '../..');
const tsx = resolve(repoRoot, 'node_modules/.bin/tsx');

async function runScript(script: string, args: string[]): Promise<void> {
  await execFileAsync(tsx, [resolve(benchDir, 'src', script), ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

describe.skipIf(!hasGringo)('benchmark scripts (smoke)', () => {
  let fixturesDir: string;
  let outputDir: string;

  beforeAll(async () => {
    fixturesDir = await mkdtemp(join(tmpdir(), 'bench-smoke-fixtures-'));
    outputDir = await mkdtemp(join(tmpdir(), 'bench-smoke-out-'));
    // Generate both the main scale and the threading scale (200) for the
    // threading test.
    for (const scale of [THREADING_SCALE, MAIN_SCALE]) {
      await generateFixtures({
        outputDir: fixturesDir,
        project: SMOKE_PROJECT,
        scale,
      });
    }
  }, 600_000);

  afterAll(async () => {
    if (fixturesDir) await rm(fixturesDir, { recursive: true, force: true });
    if (outputDir) await rm(outputDir, { recursive: true, force: true });
  });

  it('bench-main produces a BenchmarkResult JSON with runs', async () => {
    const out = join(outputDir, 'main.json');
    await runScript('bench-main.ts', [fixturesDir, out]);
    const result = JSON.parse(await readFile(out, 'utf-8')) as BenchmarkResult;
    expect(result.feature).toBe('main-scaling');
    expect(result.runs.length).toBeGreaterThan(0);
    // Every run has the canonical BenchmarkRun shape.
    const first = result.runs[0];
    expect(typeof first.method).toBe('string');
    expect(typeof first.variant).toBe('string');
    expect(typeof first.project).toBe('string');
    expect(typeof first.cardCount).toBe('number');
    expect(typeof first.totalUs).toBe('number');
    // Project value matches what the script discovered.
    expect(
      result.runs.every((r) => typeof r.project === 'string' && r.project),
    ).toBe(true);
  }, 600_000);

  it('bench-caching produces cache-disabled, cache-miss, cache-hit records', async () => {
    const out = join(outputDir, 'caching.json');
    await runScript('bench-caching.ts', [fixturesDir, out]);
    const result = JSON.parse(await readFile(out, 'utf-8')) as BenchmarkResult;
    expect(result.feature).toBe('caching');
    expect(result.runs.length).toBeGreaterThan(0);
    const variants = new Set(result.runs.map((r) => r.variant));
    expect(variants.has('cache-disabled')).toBe(true);
    expect(variants.has('cache-miss')).toBe(true);
    expect(variants.has('cache-hit')).toBe(true);
  }, 600_000);

  it('bench-threading produces async/sync records when scale=200 is present', async () => {
    const out = join(outputDir, 'threading.json');
    await runScript('bench-threading.ts', [fixturesDir, out]);
    const result = JSON.parse(await readFile(out, 'utf-8')) as BenchmarkResult;
    expect(result.feature).toBe('threading');
    expect(result.runs.length).toBeGreaterThan(0);
    const variants = new Set(result.runs.map((r) => r.variant));
    expect(variants.has('async')).toBe(true);
    expect(variants.has('sync')).toBe(true);
    expect(variants.has('async-batch')).toBe(true);
    expect(variants.has('sync-batch')).toBe(true);
  }, 600_000);
});
