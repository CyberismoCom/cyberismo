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
import type { ConfigurationLogEntry } from '../utils/configuration-logger.js';
import { ConfigurationLogger } from '../utils/configuration-logger.js';
import type { ChangeClassification } from '../mutations/registry.js';
import { classify } from '../mutations/dispatcher.js';
import { entryToMutationInput } from '../mutations/replay/convert.js';
import { write } from '../utils/rw-lock.js';

export const validBumps = ['patch', 'minor', 'major'] as const;
export type BumpType = (typeof validBumps)[number];

function classifyEntry(entry: ConfigurationLogEntry): ChangeClassification {
  try {
    return classify(entryToMutationInput(entry));
  } catch {
    // An entry this build cannot route (e.g. written by a newer version) must
    // not slip through the gate; treat it as the strictest class.
    return 'destructive';
  }
}

function describeEntries(entries: ConfigurationLogEntry[]): string {
  return entries.map((e) => `  - ${e.target} (${e.operation})`).join('\n');
}

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

    // Guard: a patch requires a clean log; a minor admits migratable changes
    // but not destructive ones; a major admits everything. Minor and major
    // bumps seal the log; consumers replay it on module update.
    // Skipped for the first version — there is no predecessor to break against.
    if (
      currentVersion &&
      bumpType !== 'major' &&
      ConfigurationLogger.hasBreakingChanges(this.project.basePath)
    ) {
      const entries = await ConfigurationLogger.entries(this.project.basePath);
      if (bumpType === 'patch') {
        throw new Error(
          'Cannot publish a patch version: the configuration log contains changes that require a migration:\n' +
            describeEntries(entries) +
            '\nUse a minor version bump, or a major version bump if destructive changes are present.',
        );
      }
      const destructive = entries.filter(
        (entry) => classifyEntry(entry) === 'destructive',
      );
      if (destructive.length > 0) {
        throw new Error(
          'Cannot publish a minor version: the configuration log contains destructive changes:\n' +
            describeEntries(destructive) +
            '\nUse a major version bump.',
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

    // Seal on the first version and every minor/major bump. Patches on an
    // existing version never seal; they must keep a clean log (guarded above).
    if (!currentVersion || bumpType !== 'patch') {
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
