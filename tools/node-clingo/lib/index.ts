/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import build from 'node-gyp-build';
import path from 'path';

let binding: any;
try {
  binding = build(path.resolve(import.meta.dirname, '..'));
} catch (error) {
  console.error('Error building clingo:', error);
  binding = build(import.meta.dirname);
}

// Default key for base programs
const DEFAULT_KEY = 'default';

/**
 * Interface for Clingo solver result
 */
interface ClingoResult {
  answers: string[];
  executionTime: number;
}

/**
 * Sets a base program that will be included in subsequent solve calls
 * @param program The base program as a string
 * @param key Optional name to identify this base program (defaults to "default")
 */
function setBaseProgram(program: string, key?: string) {
  binding.setBaseProgram(program, key || DEFAULT_KEY);
}

/**
 * Clears a specific base program
 * @param key Name of the base program to clear
 */
function clearBaseProgram(key?: string) {
  if (key) {
    binding.clearBaseProgram(key);
  } else {
    binding.clearAllBasePrograms();
  }
}

/**
 * Solves a logic program
 * @param program The logic program as a string
 * @param basePrograms Optional base program key(s) to include. Can be a string or array of strings.
 * @returns Promise resolving to an object containing answers and execution time
 */
async function solve(
  program: string,
  basePrograms?: string | string[],
): Promise<ClingoResult> {
  if (!program) {
    throw new Error('No program provided');
  }

  try {
    // If no base programs are specified, use the default
    if (!basePrograms) {
      basePrograms = DEFAULT_KEY;
    }

    const result = binding.solve(program, basePrograms);
    return result;
  } catch (error) {
    console.error('Error solving program:', error);
    throw error;
  }
}

export { solve, setBaseProgram, clearBaseProgram, ClingoResult };
export default { solve, setBaseProgram, clearBaseProgram };
