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
 * Handles version bumping commands.
 */
export class Version {
  constructor(private project: Project) {}

  /**
   * Bumps the project version in cardsConfig.json, snapshots the migration log, and commits.
   *
   * @param bumpType Which semver component to bump: 'patch', 'minor', or 'major'
   * @returns The previous and new version strings
   */
  @write((bumpType) => `Version ${bumpType} bump`)
  public async bumpVersion(
    bumpType: BumpType,
  ): Promise<{ previousVersion: string | undefined; newVersion: string }> {
    const { git } = this.project;

    // Guard: refuse to version with uncommitted changes
    if (await git.hasUncommittedChanges()) {
      throw new Error(
        'Cannot version: there are uncommitted changes. Please commit or stash them first.',
      );
    }

    const currentVersion = this.project.configuration.version;

    // Guard: breaking changes require a major bump.
    // Skipped for the first version — there is no predecessor to break against.
    if (currentVersion && bumpType !== 'major') {
      if (ConfigurationLogger.hasBreakingChanges(this.project.basePath)) {
        throw new Error(
          'Cannot publish a patch or minor version: breaking configuration changes detected. Use a major version bump.',
        );
      }
    }

    const newVersion = currentVersion
      ? semver.inc(currentVersion, bumpType)
      : '1.0.0';

    if (!newVersion) {
      throw new Error(
        `Invalid current version '${currentVersion}': cannot compute ${bumpType} bump`,
      );
    }

    // Snapshot the current migration log with the new version
    if (ConfigurationLogger.hasBreakingChanges(this.project.basePath)) {
      await ConfigurationLogger.createVersion(
        this.project.basePath,
        newVersion,
      );
    }

    // Write new version to cardsConfig
    await this.project.configuration.setVersion(newVersion);

    return { previousVersion: currentVersion, newVersion };
  }
}
