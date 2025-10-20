/**
 * Test utilities for cross-platform test support
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Get the base directory for the calling test file.
 * Works across Node versions and platforms (including Windows).
 *
 * @param defaultToUse - Pass `import.meta.dirname` from the calling test file (may be undefined)
 * @param importMetaUrl - Pass `import.meta.url` from the calling test file as fallback
 * @returns The directory path of the calling test file
 */
export function getTestBaseDir(
  defaultToUse: string | undefined,
  importMetaUrl: string,
): string {
  return defaultToUse ?? dirname(fileURLToPath(importMetaUrl));
}
