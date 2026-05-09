import { execFile } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { groundToAspif } from './gringo.js';

const execFileAsync = promisify(execFile);

interface BinaryResult {
  answers: string[];
  wallClockMs: number;
  groundMs?: number;
  solveMs?: number;
}

/**
 * Runs clingo with the given args. Treats SAT/UNSAT/UNKNOWN exits (10/20/30)
 * as success and returns their stdout. Re-throws any other failure.
 */
async function runClingo(args: string[]): Promise<string> {
  try {
    const result = await execFileAsync('clingo', args);
    return result.stdout;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'stdout' in error) {
      return (error as { stdout: string }).stdout;
    }
    throw error;
  }
}

function parseAnswers(stdout: string): string[] {
  const answers: string[] = [];
  const lines = stdout.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('Answer:') && i + 1 < lines.length) {
      answers.push(lines[i + 1]);
    }
  }
  return answers;
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
  let stdout: string;
  try {
    stdout = await runClingo(args);
  } catch (error) {
    await rm(tmpDir, { recursive: true, force: true });
    throw error;
  }
  const wallClockMs = performance.now() - start;
  await rm(tmpDir, { recursive: true, force: true });

  const answers = parseAnswers(stdout);

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
 * Solves a pre-grounded ASPIF base together with an extra query LP via the
 * clingo binary. The base is read from `aspifPath` directly (no gringo
 * invocation). Returns wall-clock time and parsed answers.
 */
export async function solveAspifWithQuery(
  aspifPath: string,
  queryProgram: string,
): Promise<{ clingoMs: number; answers: string[] }> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'clingo-incr-'));
  const queryFile = join(tmpDir, 'query.lp');
  await writeFile(queryFile, queryProgram);

  const start = performance.now();
  let stdout: string;
  try {
    stdout = await runClingo([aspifPath, queryFile]);
  } catch (error) {
    await rm(tmpDir, { recursive: true, force: true });
    throw error;
  }
  const clingoMs = performance.now() - start;
  await rm(tmpDir, { recursive: true, force: true });

  return { clingoMs, answers: parseAnswers(stdout) };
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
  const aspifFile = join(tmpDir, 'base.aspif');
  const queryFile = join(tmpDir, 'query.lp');

  await writeFile(queryFile, queryProgram);

  // Step 1: Preground base with gringo (shared helper).
  const gringoStart = performance.now();
  let aspif: string;
  try {
    aspif = await groundToAspif(baseProgram);
  } catch (error: unknown) {
    await rm(tmpDir, { recursive: true, force: true });
    throw error;
  }
  await writeFile(aspifFile, aspif);
  const gringoMs = performance.now() - gringoStart;

  // Step 2: Solve with clingo using ASPIF + query
  const clingoStart = performance.now();
  let stdout: string;
  try {
    stdout = await runClingo([aspifFile, queryFile]);
  } catch (error) {
    await rm(tmpDir, { recursive: true, force: true });
    throw error;
  }
  const clingoMs = performance.now() - clingoStart;

  await rm(tmpDir, { recursive: true, force: true });

  return {
    gringoMs,
    clingoMs,
    totalMs: gringoMs + clingoMs,
    answers: parseAnswers(stdout),
  };
}
