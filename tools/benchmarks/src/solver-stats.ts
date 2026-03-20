import { execFile } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface SolverStatistics {
  groundingTimeSec: number;
  solvingTimeSec: number;
  totalTimeSec: number;
  rules: number;
  bodies: number;
  atoms: number;
  equivalences: number;
  variables: number;
  constraints: number;
  raw: string; // full stats output for manual inspection
}

/**
 * Runs a program through `clingo --stats=2` and parses the output.
 */
export async function collectSolverStats(
  program: string,
): Promise<SolverStatistics> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'clingo-stats-'));
  const lpFile = join(tmpDir, 'program.lp');
  await writeFile(lpFile, program);

  let stdout = '';
  try {
    const result = await execFileAsync('clingo', [lpFile, '--stats=2']);
    stdout = result.stdout;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'stdout' in error) {
      stdout = (error as { stdout: string }).stdout;
    } else {
      await rm(tmpDir, { recursive: true, force: true });
      throw error;
    }
  }

  await rm(tmpDir, { recursive: true, force: true });

  const parseFloat_ = (pattern: RegExp): number => {
    const match = stdout.match(pattern);
    return match ? parseFloat(match[1]) : 0;
  };

  const parseInt_ = (pattern: RegExp): number => {
    const match = stdout.match(pattern);
    return match ? parseInt(match[1], 10) : 0;
  };

  return {
    groundingTimeSec: parseFloat_(/Grounding\s*:\s*([\d.]+)s/),
    solvingTimeSec: parseFloat_(/Solving\s*:\s*([\d.]+)s/),
    totalTimeSec: parseFloat_(/Total\s*:\s*([\d.]+)s/),
    rules: parseInt_(/Rules\s*:\s*(\d+)/),
    bodies: parseInt_(/Bodies\s*:\s*(\d+)/),
    atoms: parseInt_(/Atoms\s*:\s*(\d+)/),
    equivalences: parseInt_(/Equivalences\s*:\s*(\d+)/),
    variables: parseInt_(/Variables\s*:\s*(\d+)/),
    constraints: parseInt_(/Constraints\s*:\s*(\d+)/),
    raw: stdout,
  };
}
