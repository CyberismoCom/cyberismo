// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// node
import { basename, join, relative } from 'node:path';
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';

import { createGit, gitTimeout } from '../../infra/git/git-config.js';
import { configuredFolders } from '../../infra/paths/project-folders.js';
import { pathExists } from '../../shared/utils/file-utils.js';
import { getChildLogger } from '../../shared/utils/log-utils.js';

const logger = getChildLogger({ module: 'create' });

/**
 * Clones a git repository into the given destination directory.
 * Clones to a temporary location first, validates that the repository
 * contains at least one Cyberismo project, then moves it to the final path.
 * @param url Git URL to clone (https:// or git@)
 * @param destPath Parent directory where the repo will be cloned into
 * @returns The cloned repository's projects, with their configured prefixes
 */
export async function cloneProject(
  url: string,
  destPath: string,
): Promise<{ path: string; prefix: string }[]> {
  const repoName = basename(url, '.git').replace(/[^\w.-]/g, '_');
  const finalPath = join(destPath, repoName);

  if (pathExists(finalPath)) {
    throw new Error(`Destination '${repoName}' already exists`);
  }

  // Clone to a temp directory in destPath so rename works (same filesystem)
  await mkdir(destPath, { recursive: true });
  let tempDir: string | undefined;
  let tempClonePath!: string;
  let folders: { path: string; prefix: string }[];

  try {
    tempDir = await mkdtemp(join(destPath, '.cyberismo-clone-'));
    tempClonePath = join(tempDir, repoName);
    const git = createGit({ timeout: gitTimeout() });
    await git.clone(url, tempClonePath);

    // Validate that the cloned repo contains Cyberismo projects
    folders = await configuredFolders(tempClonePath);
    if (folders.length === 0) {
      throw new Error(
        'Cloned repository does not contain any Cyberismo projects',
      );
    }

    // Move to the final destination
    await rename(tempClonePath, finalPath);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to clone repository '${url}': ${error.message}`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    // Clean up on failure. On success rename() has already moved tempClonePath
    // so rm with force:true is a no-op. Both paths are handled uniformly here.
    const cleanupPath = tempDir ?? tempClonePath;
    if (cleanupPath) {
      await rm(cleanupPath, { recursive: true, force: true }).catch((err) => {
        logger.warn(err, `Failed to clean up temporary path '${cleanupPath}'`);
      });
    }
  }

  return folders.map(({ path, prefix }) => ({
    path: join(finalPath, relative(tempClonePath, path)),
    prefix,
  }));
}
