/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.

  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fileUrl = fileURLToPath(import.meta.url);
const dirname = path.dirname(fileUrl);

/**
 * Path to the decision-records test data
 */
export const testDataPath = path.resolve(
  dirname,
  '../../data-handler/test/test-data/valid/decision-records',
);

/**
 * Creates a temporary copy of test data for testing
 * @param testDataName Name of the test data directory (e.g., 'decision-records', 'minimal')
 * @returns Path to the temporary test data directory
 */
export async function createTempTestData(
  testDataName: string,
): Promise<string> {
  const sourceDir = path.resolve(
    dirname,
    '../../data-handler/test/test-data/valid',
    testDataName,
  );

  const tempDir = await mkdtemp(path.join(tmpdir(), 'cyberismo-mcp-test-'));
  const tempTestDataDir = path.join(tempDir, testDataName);

  await cp(sourceDir, tempTestDataDir, { recursive: true });

  return tempTestDataDir;
}

/**
 * Cleans up temporary test data
 * @param tempPath Path to the temporary directory to clean up
 */
export async function cleanupTempTestData(tempPath: string): Promise<void> {
  // Get the parent temp directory (the mkdtemp created directory)
  const tempDir = path.dirname(tempPath);
  await rm(tempDir, { recursive: true, force: true });
}
