/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details. You should have
  received a copy of the GNU Affero General Public License along with this
  program. If not, see <https://www.gnu.org/licenses/>.
*/

import semver from 'semver';

import { ModuleManager } from '../module-manager.js';
import { read } from '../utils/rw-lock.js';

import type {
  Credentials,
  ModuleUpdateStatus,
} from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';

/**
 * Handles checking for module updates.
 */
export class CheckUpdates {
  private moduleManager: ModuleManager;

  constructor(private project: Project) {
    this.moduleManager = new ModuleManager(this.project);
  }

  /**
   * Checks for available updates for all or a specific module.
   * Respects version range constraints when determining valid update targets.
   *
   * @param moduleName Optional module name to check. If omitted, checks all.
   * @param credentials Optional credentials for private modules.
   * @returns Array of update status for each checked module.
   */
  @read
  public async checkUpdates(
    moduleName?: string,
    credentials?: Credentials,
  ): Promise<ModuleUpdateStatus[]> {
    const modules = this.project.configuration.modules;

    const toCheck = moduleName
      ? modules.filter((m) => m.name === moduleName)
      : modules;

    if (moduleName && toCheck.length === 0) {
      throw new Error(`Module '${moduleName}' is not part of the project`);
    }

    const results: ModuleUpdateStatus[] = await Promise.all(
      toCheck.map(async (moduleSetting) => {
        // Read installed version from the module's own cardsConfig.json
        const installedVersion = await this.moduleManager.readModuleVersion(
          moduleSetting.name,
        );

        const isGit =
          moduleSetting.location?.startsWith('https:') ||
          moduleSetting.location?.startsWith('git@');

        if (!isGit) {
          return {
            name: moduleSetting.name,
            installedVersion,
            availableVersions: [],
            updateAvailable: false,
            isGitModule: false,
          };
        }

        try {
          const availableVersions =
            await this.moduleManager.listAvailableVersions(
              moduleSetting,
              credentials,
            );

          // Absolute latest available (availableVersions is sorted descending)
          const latestVersion: string | undefined = availableVersions[0];

          // Highest version satisfying the constraint, when one is declared
          let latestSatisfyingConstraint: string | undefined = latestVersion;
          let noMatchingVersion = false;
          if (moduleSetting.version) {
            latestSatisfyingConstraint =
              semver.maxSatisfying(
                availableVersions,
                moduleSetting.version,
              ) ?? undefined;

            if (!latestSatisfyingConstraint && availableVersions.length > 0) {
              noMatchingVersion = true;
            }
          }

          // Update available if the absolute latest is newer than what's
          // installed (or if nothing is installed yet).
          const updateAvailable = !!(
            latestVersion &&
            (!installedVersion || semver.gt(latestVersion, installedVersion))
          );

          // The constraint blocks auto-update when there's a newer absolute
          // version but it is outside the constraint, or the constraint
          // doesn't yield a newer-than-installed satisfying version.
          const constraintBlocksUpdate =
            updateAvailable &&
            (!latestSatisfyingConstraint ||
              (!!installedVersion &&
                !semver.gt(latestSatisfyingConstraint, installedVersion)));

          return {
            name: moduleSetting.name,
            installedVersion,
            latestVersion,
            latestSatisfyingConstraint,
            availableVersions,
            updateAvailable,
            constraintBlocksUpdate,
            isGitModule: true,
            versionConstraint: moduleSetting.version,
            noMatchingVersion,
          };
        } catch {
          return {
            name: moduleSetting.name,
            installedVersion,
            availableVersions: [],
            updateAvailable: false,
            isGitModule: true,
          };
        }
      }),
    );

    return results;
  }
}
