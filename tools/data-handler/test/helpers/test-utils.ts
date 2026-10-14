/**
 * Test utilities for cross-platform test support
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import { Checkout } from '../../src/infra/checkout.js';
import { Fetch } from '../../src/commands/index.js';
import { SCHEMA_VERSION } from '@cyberismo/migrations';

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

/**
 * Creates a project for tests with schema version injected when missing.
 */
export function getTestProject(path: string): InstanceType<typeof Checkout> {
  const checkout = new Checkout(path);
  if (checkout.configuration.schemaVersion === undefined) {
    checkout.configuration.schemaVersion = SCHEMA_VERSION;
  }
  return checkout;
}

/**
 * Mocks the ensureModuleListUpToDate method to avoid network calls during tests.
 * Returns a vi spy that can be restored via vi.restoreAllMocks() after tests.
 */
export function mockEnsureModuleListUpToDate(): ReturnType<typeof vi.spyOn> {
  return vi
    .spyOn(Fetch.prototype, 'ensureModuleListUpToDate')
    .mockResolvedValue([]);
}
