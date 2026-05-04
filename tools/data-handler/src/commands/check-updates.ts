/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
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

import { read } from '../utils/rw-lock.js';
import {
  buildRemoteUrl,
  declaredModules,
  installedModules,
  createSourceLayer,
  isGitLocation,
  satisfies,
  pickVersion,
} from '../modules/index.js';

import type {
  Credentials,
  ModuleUpdateStatus,
} from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';
import type {
  CheckStatus,
  ModuleDeclaration,
  ModuleInstallation,
  Version,
} from '../modules/types.js';

/**
 * Handles checking for module updates.
 */
export class CheckUpdates {
  constructor(private project: Project) {}

  /**
   * Checks for available updates for all or a specific module.
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
    const sourceLayer = createSourceLayer();

    const allDeclared = declaredModules(this.project);
    const declared = moduleName
      ? allDeclared.filter((d) => d.name === moduleName)
      : allDeclared;

    if (moduleName && declared.length === 0) {
      throw new Error(`Module '${moduleName}' is not part of the project`);
    }

    const installed = await installedModules(this.project);
    const installedByName = new Map<string, ModuleInstallation>(
      installed.map((i) => [i.name, i]),
    );

    const results = await Promise.all(
      declared.map(async (decl) => {
        const installation = installedByName.get(decl.name);
        const isGitModule = isGitLocation(decl.source.location);

        // A malformed private HTTPS URL is indistinguishable from an
        // unreachable source here, so treat it as `source_unreachable`.
        let remoteUrl: string;
        try {
          remoteUrl = buildRemoteUrl(decl.source, credentials);
        } catch {
          return {
            name: decl.name,
            installedVersion: installation?.version,
            availableVersions: [],
            updateAvailable: false,
            isGitModule,
            versionConstraint: decl.versionRange,
            status: 'source_unreachable',
          } satisfies ModuleUpdateStatus;
        }

        const outcome = await sourceLayer.queryRemote(decl.source, {
          remoteUrl,
          range: decl.versionRange,
        });

        if (!outcome.reachable) {
          return {
            name: decl.name,
            installedVersion: installation?.version,
            availableVersions: [],
            updateAvailable: false,
            isGitModule,
            versionConstraint: decl.versionRange,
            status: 'source_unreachable',
          } satisfies ModuleUpdateStatus;
        }

        // `queryRemote` only returns latest + latestSatisfying, so re-list
        // to populate `availableVersions`.
        let availableVersions: string[];
        try {
          availableVersions = await sourceLayer.listRemoteVersions(
            decl.source.location,
            remoteUrl,
          );
        } catch {
          availableVersions = [];
        }

        const latestVersion = outcome.latest;
        const latestSatisfyingConstraint =
          outcome.latestSatisfying ??
          (decl.versionRange === undefined ? latestVersion : undefined);

        const installedVersion = installation?.version;
        const updateAvailable = !!(
          latestVersion &&
          (!installedVersion || semver.gt(latestVersion, installedVersion))
        );

        const constraintBlocksUpdate =
          updateAvailable &&
          (!latestSatisfyingConstraint ||
            (!!installedVersion &&
              !semver.gt(latestSatisfyingConstraint, installedVersion)));

        const noMatchingVersion =
          !!decl.versionRange &&
          availableVersions.length > 0 &&
          !latestSatisfyingConstraint;

        const status = deriveStatus({
          declaration: decl,
          installedVersion,
          availableVersions,
          latestSatisfying: latestSatisfyingConstraint,
          updateAvailable,
          constraintBlocksUpdate: constraintBlocksUpdate ?? false,
        });

        return {
          name: decl.name,
          installedVersion,
          latestVersion,
          latestSatisfyingConstraint,
          availableVersions,
          updateAvailable,
          constraintBlocksUpdate,
          isGitModule,
          versionConstraint: decl.versionRange,
          noMatchingVersion,
          status,
        } satisfies ModuleUpdateStatus;
      }),
    );

    return results;
  }
}

/**
 * Derive the `CheckStatus` for a reachable module. Branches are ordered and
 * mutually exclusive.
 */
function deriveStatus(input: {
  declaration: ModuleDeclaration;
  installedVersion?: Version;
  availableVersions: string[];
  latestSatisfying?: Version;
  updateAvailable: boolean;
  constraintBlocksUpdate: boolean;
}): CheckStatus {
  const {
    declaration,
    installedVersion,
    availableVersions,
    latestSatisfying,
    updateAvailable,
    constraintBlocksUpdate,
  } = input;

  if (declaration.versionRange) {
    const satisfied = pickVersion(availableVersions, declaration.versionRange);
    if (!satisfied) {
      return 'range_unsatisfiable';
    }
  }

  if (
    installedVersion &&
    declaration.versionRange &&
    !satisfies(installedVersion, declaration.versionRange)
  ) {
    return 'drifted';
  }

  if (updateAvailable && constraintBlocksUpdate) {
    return 'range_blocks_update';
  }

  if (updateAvailable) {
    return 'update_available';
  }

  void latestSatisfying;
  return 'up_to_date';
}
