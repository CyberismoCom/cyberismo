import path from 'path';
import build from 'node-gyp-build';

let binding: any;
try {
  binding = build(path.resolve(import.meta.dirname, '..'));
} catch (error) {
  binding = build(import.meta.dirname);
}

/**
 * Interface for Clingo solver result
 */
interface ClingoResult {
  answers: string[];
  executionTime: number;
}

/**
 * Sets a base program that will be included in all subsequent solve calls
 * @param program The base program as a string
 */
function setBaseProgram(program: string) {
  binding.setBaseProgram(program);
}

/**
 * Solves a logic program
 * @param program The logic program as a string
 * @returns Promise resolving to an object containing answers and execution time
 */
async function solve(program: string): Promise<ClingoResult> {
  if (!program) {
    throw new Error('No program provided');
  }

  try {
    const result = binding.solve(program);
    return result;
  } catch (error) {
    console.error('Error solving program:', error);
    throw error;
  }
}

export { solve, setBaseProgram, ClingoResult };
export default { solve, setBaseProgram };
