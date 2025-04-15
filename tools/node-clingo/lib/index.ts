import path from 'path';
import build from 'node-gyp-build';

let binding: any;
try {
  binding = build(path.resolve(import.meta.dirname, '..'));
} catch (error) {
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
