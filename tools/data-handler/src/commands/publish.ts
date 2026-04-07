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

import type { Project } from '../containers/project.js';
import { GitManager } from '../utils/git-manager.js';
import { write } from '../utils/rw-lock.js';

/**
 * Handles version publishing commands.
 * Creates a git tag from the version in cardsConfig and pushes to remote.
 */
export class Publish {
  constructor(private project: Project) {}

  /**
   * Publishes the current project version by creating a git tag and pushing.
   *
   * @param dryRun If true, returns what would happen without doing it
   * @returns The published version string
   */
  @write(() => 'Publish version')
  public async publishVersion(
    dryRun: boolean,
    remote?: string,
  ): Promise<{ version: string; remote: string; dryRun: boolean }> {
    const { git } = this.project;
    const version = this.project.configuration.version;
    const resolvedRemote = remote || GitManager.DEFAULT_REMOTE;

    // Guard: no version set
    if (!version) {
      throw new Error("No version set. Run 'cyberismo create version <bump>' first.");
    }

    // Guard: version already tagged
    const tags = await git.listVersionTags();
    if (tags.includes(`v${version}`)) {
      throw new Error(
        `Version v${version} is already published. Bump the version first.`,
      );
    }

    if (!dryRun) {
      // Create annotated tag and push. If push fails, clean up the local tag
      // so a retry doesn't hit the "already published" guard.
      const tagMessage = `Release v${version}`;
      await git.tagVersion(version, tagMessage);
      try {
        await git.push({ tags: true, remote: resolvedRemote });
      } catch (error) {
        await git.deleteTag(version);
        throw error;
      }
    }

    return { version, remote: resolvedRemote, dryRun };
  }
}
