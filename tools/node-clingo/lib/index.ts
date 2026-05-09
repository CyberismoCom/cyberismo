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
    options?: SolveOptions,
  ): Promise<RawClingoResult>;
  buildProgram(program: string, categories: string[]): string;
}

export interface ClingoOptions {
  preParsing?: boolean;
}

interface NativeBinding {
  ClingoContext: new (options?: ClingoOptions) => NativeClingoContext;
  clearCache(): void;
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
  constructor(
    message: string,
    public details: { errors: string[]; warnings: string[]; program?: string },
  ) {
    super(message);
  }
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
 * Options for creating a ClingoContext
 */
export interface ClingoOptions {
  /**
   * When false, programs store raw text and AST parsing happens at solve time.
   * Default: true
   */
  preParsing?: boolean;
}

/**
 * Per-call options for {@link ClingoContext.solve}.
 */
export interface SolveOptions {
  /**
   * When false, this call acts as if there is no cache: the cache key hash is
   * not computed, the shared result cache is not consulted, and the result
   * produced by this call is not stored. The returned `stats.cacheHit` is
   * always `false` in this mode. Default: true.
   */
  cache?: boolean;
}

/**
 * A Clingo solver instance with its own isolated program store.
 * The solve result cache is shared globally across all instances.
 */
export class ClingoContext {
  private _ctx: NativeClingoContext;

  constructor(options?: ClingoOptions) {
    this._ctx = new nativeBinding!.ClingoContext(options);
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
   * Solves a logic program.
   * @param program The logic program as a string
   * @param categories Optional array of program keys or categories to include
   * @param options Optional per-call options. Pass `{ cache: false }` to bypass
   *   the shared result cache entirely for this call.
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
      return await this._ctx.solve(program, categories ?? [], options);
    } catch (error) {
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

        throw new ClingoError(errorMessage, {
          errors,
          warnings,
          program: prog,
        });
      }
      throw error;
    }
  }
}

/**
 * Clears the shared solve result cache.
 */
export function clearCache(): void {
  nativeBinding!.clearCache();
}

export default ClingoContext;
