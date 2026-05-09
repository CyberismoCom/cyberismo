import { execFile } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface BinaryResult {
  answers: string[];
  wallClockMs: number;
  groundMs?: number;
  solveMs?: number;
}

/**
 * Runs a logic program through the clingo binary.
 * Returns wall-clock time and optionally parsed solver stats.
 */
export async function solveBinary(
  program: string,
  useStats = false,
): Promise<BinaryResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'clingo-bench-'));
  const lpFile = join(tmpDir, 'program.lp');
  await writeFile(lpFile, program);

  const args = [lpFile];
  if (useStats) args.push('--stats');

  const start = performance.now();
  let stdout = '';

  try {
    const result = await execFileAsync('clingo', args);
    stdout = result.stdout;
  } catch (error: unknown) {
    // Clingo exits with code 10/20/30 for SAT/UNSAT/UNKNOWN — still valid
    if (error && typeof error === 'object' && 'stdout' in error) {
      stdout = (error as { stdout: string }).stdout;
    } else {
      await rm(tmpDir, { recursive: true, force: true });
      throw error;
    }
  }

  const wallClockMs = performance.now() - start;
  await rm(tmpDir, { recursive: true, force: true });

  // Parse answer sets from stdout
  const answers: string[] = [];
  const lines = stdout.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('Answer:') && i + 1 < lines.length) {
      answers.push(lines[i + 1]);
    }
  }

  // Parse stats if requested
  let groundMs: number | undefined;
  let solveMs: number | undefined;
  if (useStats) {
    const groundMatch = stdout.match(/Grounding\s*:\s*([\d.]+)s/);
    const solveMatch = stdout.match(/Solving\s*:\s*([\d.]+)s/);
    if (groundMatch) groundMs = parseFloat(groundMatch[1]) * 1000;
    if (solveMatch) solveMs = parseFloat(solveMatch[1]) * 1000;
  }

  return { answers, wallClockMs, groundMs, solveMs };
}

/**
 * Pregrounding pipeline: gringo (base → ASPIF) → clingo (ASPIF + query)
 */
export async function solveWithPregrounding(
  baseProgram: string,
  queryProgram: string,
): Promise<{
  gringoMs: number;
  clingoMs: number;
  totalMs: number;
  answers: string[];
}> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'clingo-preground-'));
  const baseFile = join(tmpDir, 'base.lp');
  const aspifFile = join(tmpDir, 'base.aspif');
  const queryFile = join(tmpDir, 'query.lp');

  await writeFile(baseFile, baseProgram);
  await writeFile(queryFile, queryProgram);

  // Step 1: Preground base with gringo
  const gringoStart = performance.now();
  try {
    const gringoResult = await execFileAsync('gringo', [
      baseFile,
      '--output=smodels',
    ]);
    await writeFile(aspifFile, gringoResult.stdout);
  } catch (error: unknown) {
    await rm(tmpDir, { recursive: true, force: true });
    throw new Error(
      `gringo failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const gringoMs = performance.now() - gringoStart;

  // Step 2: Solve with clingo using ASPIF + query
  const clingoStart = performance.now();
  let stdout = '';
  try {
    const result = await execFileAsync('clingo', [aspifFile, queryFile]);
    stdout = result.stdout;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'stdout' in error) {
      stdout = (error as { stdout: string }).stdout;
    } else {
      await rm(tmpDir, { recursive: true, force: true });
      throw error;
    }
  }
  const clingoMs = performance.now() - clingoStart;

  await rm(tmpDir, { recursive: true, force: true });

  // Parse answers
  const answers: string[] = [];
  const lines = stdout.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('Answer:') && i + 1 < lines.length) {
      answers.push(lines[i + 1]);
    }
  }

  return { gringoMs, clingoMs, totalMs: gringoMs + clingoMs, answers };
}
