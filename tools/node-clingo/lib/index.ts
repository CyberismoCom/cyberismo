/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

interface RawClingoResult {
  answers: string[];
  stats: {
    glue: number;
    add: number;
    ground: number;
    solve: number;
    cacheHit: boolean;
  };
}

interface NativeClingoContext {
  setProgram(key: string, program: string, categories: string[]): void;
  removeProgram(key: string): boolean;
  removeAllPrograms(): void;
  solve(
    program: string,
    categories: string[],
    options: SolveOptions,
  ): Promise<RawClingoResult>;
  buildProgram(program: string, categories: string[]): string;
  commit(): Promise<SnapshotInfo>;
}

/**
 * Options for solve().
 */
export interface SolveOptions {
  /**
   * Replay the committed knowledge snapshot instead of grounding the
   * `knowledge` category. Rejects with `code: 'SNAPSHOT_MISSING'` if
   * commit() has never been called, or `code: 'SNAPSHOT_STALE'` if the
   * knowledge programs have changed (or the snapshot's @today has rolled
   * over) since the last commit().
   */
  snapshot?: boolean;
}

/**
 * Result of committing the `knowledge` category to a snapshot.
 */
export interface SnapshotInfo {
  revision: number;
  atoms: number;
  stats: { add: number; ground: number; solve: number };
}

/**
 * Result of validating a logic program without solving it.
 */
export interface ClingoValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface NativeBinding {
  ClingoContext: new () => NativeClingoContext;
  clearCache(): void;
  validateProgram(program: string): ClingoValidationResult;
}

const require = createRequire(import.meta.url);
const pkgRoot = resolve(import.meta.dirname, '..');
const localBinary = resolve(pkgRoot, 'build', 'Release', 'node-clingo.node');

let nativeBinding: NativeBinding | undefined;

if (existsSync(localBinary)) {
  // Dev: a contributor ran `pnpm build:native` in-tree.
  nativeBinding = require(localBinary) as NativeBinding;
} else {
  // Published: exactly one optional dep resolves via os/cpu/libc filters.
  const candidates =
    process.platform === 'linux'
      ? [
          `@cyberismo/node-clingo-linux-${process.arch}-gnu`,
          `@cyberismo/node-clingo-linux-${process.arch}-musl`,
        ]
      : [`@cyberismo/node-clingo-${process.platform}-${process.arch}`];

  for (const name of candidates) {
    try {
      nativeBinding = require(name) as NativeBinding;
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw e;
    }
  }

  if (!nativeBinding) {
    throw new Error(
      `@cyberismo/node-clingo: no prebuilt binary installed for ${process.platform}-${process.arch}.\n` +
        `Tried: ${candidates.join(', ')}.\n` +
        `If your package manager ran with --no-optional or --omit=optional, reinstall without it.\n` +
        `If your platform is not in the supported matrix, please open an issue at\n` +
        `  https://github.com/CyberismoCom/cyberismo/issues`,
    );
  }
}

/**
 * Clingo error class
 * @param message The error message
 * @param details The error details
 * @param details.errors The errors
 * @param details.warnings The warnings
 * @param details.program The program that caused the error if available (only syntax errors support this)
 */
export class ClingoError extends Error {
  /** Machine-readable code carried over from the native rejection, if it had one. */
  code?: string;

  constructor(
    message: string,
    public details: { errors: string[]; warnings: string[]; program?: string },
  ) {
    super(message);
  }
}

/**
 * Converts a native rejection carrying `{ errors, warnings, program? }` details (as
 * `spawnSolveTask`/`spawnCommitTask` attach on a ClingoSolveException) into a ClingoError
 * with a friendlier message for parse/syntax failures, preserving `code` if the native
 * error had one. A coded error with no `details` (e.g. solve()'s SNAPSHOT_MISSING /
 * SNAPSHOT_STALE, which are plain native errors, not ClingoSolveExceptions) is returned
 * unchanged -- its `code` is already an own property. Anything else -- a plain Error, or
 * any non-Error value -- is also returned unchanged.
 */
function toClingoError(error: unknown): unknown {
  if (
    error instanceof Error &&
    'details' in error &&
    typeof error.details === 'object' &&
    error.details !== null &&
    'errors' in error.details &&
    'warnings' in error.details
  ) {
    const {
      errors,
      warnings,
      program: prog,
    } = error.details as {
      errors: string[];
      warnings: string[];
      program?: string;
    };

    const errorMessage =
      error.message === 'parsing failed' || error.message === 'syntax error'
        ? `Parsing failed when processing program '${prog === '__program__' ? 'main program' : prog}' with errors: ${errors.join(', ')}`
        : error.message;

    const clingoError = new ClingoError(errorMessage, {
      errors,
      warnings,
      program: prog,
    });
    clingoError.code = (error as { code?: string }).code;
    return clingoError;
  }
  return error;
}

/**
 * Interface for Clingo solver result
 */
export interface ClingoResult {
  answers: string[];
  stats: {
    glue: number;
    add: number;
    ground: number;
    solve: number;
    cacheHit: boolean;
  };
}

/**
 * A Clingo solver instance with its own isolated program store.
 * The solve result cache is shared globally across all instances.
 */
export class ClingoContext {
  private _ctx: NativeClingoContext;

  constructor() {
    this._ctx = new nativeBinding!.ClingoContext();
  }

  /**
   * Stores or updates a named program with optional categories.
   */
  setProgram(key: string, program: string, categories?: string[]): void {
    this._ctx.setProgram(key, program, categories ?? []);
  }

  /**
   * Removes a stored program by key.
   * @returns true if the program was found and removed, false if it didn't exist
   */
  removeProgram(key: string): boolean {
    return this._ctx.removeProgram(key);
  }

  /**
   * Removes all stored programs.
   */
  removeAllPrograms(): void {
    this._ctx.removeAllPrograms();
  }

  /**
   * Gets the complete assembled logic program as a string without solving.
   */
  buildProgram(program: string, categories?: string[]): string {
    return this._ctx.buildProgram(program, categories ?? []);
  }

  /**
   * Solves the `knowledge` category once and keeps its conclusions for snapshot solves.
   */
  async commit(): Promise<SnapshotInfo> {
    try {
      return await this._ctx.commit();
    } catch (error) {
      throw toClingoError(error);
    }
  }

  /**
   * Solves a logic program.
   * @param program The logic program as a string
   * @param categories Optional array of program keys or categories to include
   * @param options Optional solve options, e.g. `{ snapshot: true }` to replay the
   * committed knowledge snapshot instead of grounding the `knowledge` category
   * @returns Promise resolving to answers and execution stats
   */
  async solve(
    program: string,
    categories?: string[],
    options?: SolveOptions,
  ): Promise<ClingoResult> {
    if (!program) {
      throw new Error('No program provided');
    }

    try {
      return await this._ctx.solve(program, categories ?? [], options ?? {});
    } catch (error) {
      throw toClingoError(error);
    }
  }
}

/**
 * Clears the shared solve result cache.
 */
export function clearCache(): void {
  nativeBinding!.clearCache();
}

/**
 * Validates a logic program without grounding or solving it.
 * Catches syntax errors and safety errors (e.g. unsafe variables).
 * Invalid input is reported in the result, not thrown.
 */
export function validateProgram(program: string): ClingoValidationResult {
  return nativeBinding!.validateProgram(program);
}

export default ClingoContext;
