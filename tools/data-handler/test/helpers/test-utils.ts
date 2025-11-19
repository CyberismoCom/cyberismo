/**
 * Test utilities for cross-platform test support
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project } from '../../src/containers/project.js';
import { SCHEMA_VERSION } from '@cyberismo/assets';

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
 * Creates a project for tests with auto-save disabled and schema version injected.
 */
export function getTestProject(path: string): InstanceType<typeof Project> {
  const project = new Project(path, { autoSave: false });
  if (project.configuration.schemaVersion === undefined) {
    project.configuration.schemaVersion = SCHEMA_VERSION;
  }
  return project;
}
