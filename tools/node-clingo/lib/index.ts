/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import build from 'node-gyp-build';
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
  solve(program: string, categories: string[]): Promise<RawClingoResult>;
  buildProgram(program: string, categories: string[]): string;
}

interface NativeBinding {
  ClingoContext: new (options?: {
    preParsing?: boolean;
  }) => NativeClingoContext;
  clearCache(): void;
}

let nativeBinding: NativeBinding;
// Use import.meta.dirname when available, fallback to __dirname for compatibility
const currentDirname = import.meta.dirname || __dirname;
try {
  nativeBinding = build(resolve(currentDirname, '..')) as NativeBinding;
} catch (error) {
  console.error('Error building clingo:', error);
  nativeBinding = build(currentDirname) as NativeBinding;
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
 * A Clingo solver instance with its own isolated program store.
 * The solve result cache is shared globally across all instances.
 */
export class ClingoContext {
  private _ctx: NativeClingoContext;

  constructor(options?: ClingoOptions) {
    this._ctx = new nativeBinding.ClingoContext(options);
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
   * @returns Promise resolving to answers and execution stats
   */
  async solve(program: string, categories?: string[]): Promise<ClingoResult> {
    if (!program) {
      throw new Error('No program provided');
    }

    try {
      return await this._ctx.solve(program, categories ?? []);
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

        if (
          (error.message === 'parsing failed' ||
            error.message === 'syntax error') &&
          prog
        ) {
          throw new ClingoError(
            `Parsing failed when processing program '${prog === '__program__' ? 'main program' : prog}' with errors: ${errors.join(', ')}`,
            { errors, warnings, program: prog },
          );
        }
        throw new ClingoError(error.message, {
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
  nativeBinding.clearCache();
}

export default ClingoContext;
