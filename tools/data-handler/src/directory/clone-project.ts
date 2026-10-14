/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { basename, join } from 'node:path';
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';

import { scanForProjects } from '../project-scanner.js';
import { createGit, gitTimeout } from '../infra/git-config.js';
import { pathExists } from '../utils/file-utils.js';
import { getChildLogger } from '../utils/log-utils.js';

const logger = getChildLogger({ module: 'create' });

/**
 * Clones a git repository into the given destination directory.
 * Clones to a temporary location first, validates that the repository
 * contains at least one Cyberismo project, then moves it to the final path.
 * @param url Git URL to clone (https:// or git@)
 * @param destPath Parent directory where the repo will be cloned into
 * @returns The path to the cloned repository
 */
export async function cloneProject(
  url: string,
  destPath: string,
): Promise<string> {
  const repoName = basename(url, '.git').replace(/[^\w.-]/g, '_');
  const finalPath = join(destPath, repoName);

  if (pathExists(finalPath)) {
    throw new Error(`Destination '${repoName}' already exists`);
  }

  // Clone to a temp directory in destPath so rename works (same filesystem)
  await mkdir(destPath, { recursive: true });
  let tempDir: string | undefined;
  let tempClonePath!: string;

  try {
    tempDir = await mkdtemp(join(destPath, '.cyberismo-clone-'));
    tempClonePath = join(tempDir, repoName);
    const git = createGit({ timeout: gitTimeout() });
    await git.clone(url, tempClonePath);

    // Validate that the cloned repo contains Cyberismo projects
    const projects = await scanForProjects(tempClonePath);
    if (projects.length === 0) {
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

  return finalPath;
}
