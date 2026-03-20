/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import semver from 'semver';
import type { Project } from '../containers/project.js';
import { ConfigurationLogger } from '../utils/configuration-logger.js';
import { write } from '../utils/rw-lock.js';

export const validBumps = ['patch', 'minor', 'major'] as const;
export type BumpType = (typeof validBumps)[number];

/**
 * Handles version publishing commands.
 */
export class Publish {
  constructor(private project: Project) {}

  /**
   * Publishes a new version of the project.
   * Creates a git commit and an annotated tag with the bumped semantic version.
   *
   * @param bumpType Which semver component to bump: 'patch', 'minor', or 'major'
   * @param push If true, pushes the commit and tag to the remote
   * @returns The previous and new version strings
   */
  @write((bumpType) => `Publish ${bumpType} version`)
  public async publishVersion(
    bumpType: BumpType,
    push?: boolean,
  ): Promise<{ previousVersion: string | undefined; newVersion: string }> {
    const { git } = this.project;

    // Guard: refuse to publish with uncommitted changes
    if (await git.hasUncommittedChanges()) {
      throw new Error(
        'Cannot publish: there are uncommitted changes. Please commit or stash them first.',
      );
    }

    const currentVersion = await git.getVersion();

    // Guard: nothing to publish if no changes since last tag
    if (currentVersion && !(await git.hasChangesSinceVersion(currentVersion))) {
      throw new Error(
        'Nothing to publish. No changes since the last version tag.',
      );
    }

    const newVersion = currentVersion
      ? semver.inc(currentVersion, bumpType)!
      : '1.0.0';
    const commitMessage = `Release v${newVersion}`;

    // Snapshot the current migration log with the new version
    if (ConfigurationLogger.hasLog(this.project.basePath)) {
      try {
        await ConfigurationLogger.createVersion(
          this.project.basePath,
          newVersion,
        );
      } catch (error) {
        // Empty migration log is expected and safe to ignore
        if (
          !(
            error instanceof Error &&
            error.message.includes('migration log is empty')
          )
        ) {
          throw error;
        }
      }
    }

    // Commit all project changes and tag
    await git.commit(commitMessage);
    await git.tagVersion(newVersion, commitMessage);

    if (push) {
      await git.push({ tags: true });
    }

    return { previousVersion: currentVersion, newVersion };
  }
}
