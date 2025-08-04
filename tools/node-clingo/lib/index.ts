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

let binding: any;
try {
  binding = build(resolve(import.meta.dirname, '..'));
} catch (error) {
  console.error('Error building clingo:', error);
  binding = build(import.meta.dirname);
}

/**
 * Clingo error class
 * @param message The error message
 * @param details The error details
 * @param details.errors The errors
 * @param details.warnings The warnings
 * @param details.program The program that caused the error if available(Only syntax errors support this)
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
interface ClingoResult {
  answers: string[];
  executionTime: number;
}

/**
 * Sets a program with optional categories
 * @param key Name to identify this program
 * @param program The program content
 * @param categories Optional array of category names
 */
function setProgram(key: string, program: string, categories?: string[]) {
  binding.setProgram(key, program, categories);
}

/**
 * Removes a stored program
 * @param key Name of the program to remove
 * @returns true if the program was found and removed, false if it didn't exist
 */
function removeProgram(key: string): boolean {
  return binding.removeProgram(key);
}

/**
 * Removes all stored programs that have the specified category
 * @param category The category to match
 * @returns The number of programs removed
 */
function removeProgramsByCategory(category: string): number {
  return binding.removeProgramsByCategory(category);
}

/**
 * Solves a logic program
 * @param program The logic program as a string
 * @param categories Optional array of program keys or categories to include
 * @returns Promise resolving to an object containing answers and execution time
 */
async function solve(
  program: string,
  categories?: string[],
): Promise<ClingoResult> {
  if (!program) {
    throw new Error('No program provided');
  }

  try {
    const result = binding.solve(program, categories ?? []);
    return result;
  } catch (error) {
    if (
      error instanceof Error &&
      'details' in error &&
      typeof error.details === 'object' &&
      error.details !== null &&
      'errors' in error.details &&
      'warnings' in error.details
    ) {
      const { errors, warnings, program } = error.details as {
        errors: string[];
        warnings: string[];
        program?: string;
      };

      if (error.message === 'parsing failed' && program) {
        throw new ClingoError(
          `Parsing failed when processing program '${program === '__program__' ? 'main program' : program}' with errors: ${errors.join(', ')}`,
          { errors, warnings, program },
        );
      }
      throw new ClingoError(error.message, { errors, warnings, program });
    }
    throw error;
  }
}

function removeAllPrograms() {
  binding.removeAllPrograms();
}

export {
  solve,
  setProgram,
  removeProgram,
  removeProgramsByCategory,
  removeAllPrograms,
  ClingoResult,
};
export default {
  solve,
  setProgram,
  removeProgram,
  removeProgramsByCategory,
  removeAllPrograms,
};
