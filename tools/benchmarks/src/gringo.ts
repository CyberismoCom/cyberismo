/**
 * Shared `gringo --output=smodels` invocation.
 *
 * Used by both the fixture generator (`generate-fixtures.ts`) and the binary
 * baseline runner (`binary-baseline.ts`). Writes the program to a tempfile,
 * runs gringo, and returns the resulting ASPIF/smodels text on stdout. The
 * tempdir is always cleaned up.
 *
 * On failure, the thrown Error includes gringo's stderr so callers can see
 * the actual diagnostic (e.g. parse errors, undefined predicates) rather than
 * just an opaque non-zero exit.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Grounds `baseProgram` via `gringo --output=smodels` and returns the
 * resulting ASPIF text. Throws on gringo failure with stderr included.
 */
export async function groundToAspif(baseProgram: string): Promise<string> {
  const tmp = await mkdtemp(join(tmpdir(), 'gringo-'));
  const baseFile = join(tmp, 'base.lp');
  try {
    await writeFile(baseFile, baseProgram);
    // 1 GiB maxBuffer is empirically required at scale 50000.
    const result = await execFileAsync(
      'gringo',
      [baseFile, '--output=smodels'],
      { maxBuffer: 1024 * 1024 * 1024 },
    );
    return result.stdout;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const stderr =
      error && typeof error === 'object' && 'stderr' in error
        ? String((error as { stderr: unknown }).stderr ?? '')
        : '';
    throw new Error(
      `gringo failed: ${message}${stderr ? '\nstderr: ' + stderr : ''}`,
      { cause: error },
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
