/**
 * Smoke test for `bench-solver-stats`. Generates a tiny one-scale fixture in
 * `beforeAll` and runs the script against it via tsx. Skipped entirely if
 * either `gringo` (needed for fixture generation) or `clingo` (needed for
 * stats collection) is not on PATH.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { generateFixtures } from '../src/generate-fixtures.js';
import type { SolverStatsResult } from '../src/types.js';

const execFileAsync = promisify(execFile);

const SMOKE_PROJECT = 'cyberismo-docs';
const SCALE = 1000;

async function gringoAvailable(): Promise<boolean> {
  try {
    await execFileAsync('gringo', ['--version']);
    return true;
  } catch {
    return false;
  }
}

async function clingoAvailable(): Promise<boolean> {
  try {
    await execFileAsync('clingo', ['--version']);
    return true;
  } catch {
    return false;
  }
}

const hasGringo = await gringoAvailable();
const hasClingo = await clingoAvailable();
const canRun = hasGringo && hasClingo;

if (!canRun) {
  console.warn(
    `[bench-solver-stats.test] skipping: gringo=${hasGringo}, clingo=${hasClingo}`,
  );
}

const benchDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(benchDir, '../..');
const tsx = resolve(repoRoot, 'node_modules/.bin/tsx');

describe.skipIf(!canRun)('bench-solver-stats (smoke)', () => {
  let fixturesDir: string;
  let outputDir: string;

  beforeAll(async () => {
    fixturesDir = await mkdtemp(join(tmpdir(), 'bench-solverstats-fixtures-'));
    outputDir = await mkdtemp(join(tmpdir(), 'bench-solverstats-out-'));
    await generateFixtures({
      outputDir: fixturesDir,
      projects: [SMOKE_PROJECT],
      scaleMin: SCALE,
      scaleMax: SCALE,
    });
  }, 600_000);

  afterAll(async () => {
    if (fixturesDir) await rm(fixturesDir, { recursive: true, force: true });
    if (outputDir) await rm(outputDir, { recursive: true, force: true });
  });

  it('produces one record per (variant, query) at the requested scale', async () => {
    const out = join(outputDir, 'solver-stats.json');
    await execFileAsync(
      tsx,
      [
        resolve(benchDir, 'src/bench-solver-stats.ts'),
        fixturesDir,
        out,
        '--scales',
        String(SCALE),
        '--queries',
        'tree',
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );

    const result = JSON.parse(
      await readFile(out, 'utf-8'),
    ) as SolverStatsResult;
    expect(result.feature).toBe('solver-stats');
    expect(result.config.scales).toEqual([SCALE]);
    expect(result.config.queries).toEqual(['tree']);
    // 1 project × 1 scale × 2 variants × 1 query = 2 records.
    expect(result.runs.length).toBe(2);

    const variants = new Set(result.runs.map((r) => r.variant));
    expect(variants.has('baseline')).toBe(true);
    expect(variants.has('baseline+resultfield')).toBe(true);

    for (const r of result.runs) {
      expect(r.feature).toBe('solver-stats');
      expect(r.query).toBe('tree');
      expect(r.cardCount).toBeGreaterThan(0);
      // Cyberismo programs are non-trivial — these must be > 0 even at a
      // small scale. Stats are integers ≥ 0; the assertions below are tight
      // enough to catch a totally-broken collection without being flaky.
      expect(r.rules).toBeGreaterThan(0);
      expect(r.atoms).toBeGreaterThan(0);
      expect(r.groundingTimeSec).toBeGreaterThan(0);
    }

    // QL optimisation: the resultField variant must not increase program
    // size relative to the baseline variant for the same (project, scale,
    // query) cell.
    const byVariant = new Map(result.runs.map((r) => [r.variant, r]));
    const baseline = byVariant.get('baseline')!;
    const optimized = byVariant.get('baseline+resultfield')!;
    expect(optimized.rules).toBeLessThanOrEqual(baseline.rules);
  }, 600_000);
});
