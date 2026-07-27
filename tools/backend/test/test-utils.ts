import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fileUrl = fileURLToPath(import.meta.url);
const dirname = path.dirname(fileUrl);

/**
 * Creates a temporary copy of test data for testing
 * @param testDataName Name of the test data directory (e.g., 'decision-records', 'minimal')
 * @returns Path to the temporary test data directory
 */
export async function createTempTestData(
  testDataName: string,
): Promise<string> {
  const sourceDir =
    testDataName !== 'module-test'
      ? path.resolve(
          dirname,
          '../../data-handler/test/test-data/valid',
          testDataName,
        )
      : path.resolve(dirname, '../../../module-test');

  const tempDir = await mkdtemp(path.join(tmpdir(), 'cyberismo-test-'));
  const tempTestDataDir = path.join(tempDir, testDataName);

  // '.temp' holds the cached hub module list and '.logs' the log output. Both
  // are generated, gitignored state that earlier runs leave in the source
  // fixture; copying them in would carry one run's results into the next.
  const generated = new Set(['.temp', '.logs']);
  await cp(sourceDir, tempTestDataDir, {
    recursive: true,
    filter: (source) => !generated.has(path.basename(source)),
  });

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
