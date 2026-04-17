/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { GitManager } from './utils/git-manager.js';
import { readJsonFile } from './utils/json.js';

import type {
  Credentials,
  ModuleSetting,
} from './interfaces/project-interfaces.js';
import type { Project } from './containers/project.js';

const HTTPS_PROTOCOL = 'https:';

/**
 * Thin legacy facade over the module system. In the Phase 8 rewire the
 * heavy lifting moved into `./modules/` (resolver, installer, inventory,
 * source, orphans); this class is retained pending its Phase 9 deletion
 * to avoid breaking a handful of tests that still spy on it.
 *
 * The public surface is deliberately minimal:
 *
 *  - {@link listAvailableVersions} — delegation shim over
 *    {@link GitManager.listRemoteVersionTags}, same contract as before.
 *  - {@link readModuleVersion} — delegation shim that reads the installed
 *    module's own `cardsConfig.json` to surface the persisted version.
 *
 * Every other public method that used to live here (import/update/remove
 * orchestration) now lives in `commands/import.ts`, `commands/remove.ts`
 * and the `modules/` layers.
 */
export class ModuleManager {
  constructor(private project: Project) {}

  /**
   * Lists available version tags for a module from its remote repository.
   * @param module Module to query versions for.
   * @param credentials Optional credentials for private repositories.
   * @returns Semver version strings sorted descending (e.g. ["2.1.0", "1.0.0"])
   */
  public async listAvailableVersions(
    module: ModuleSetting,
    credentials?: Credentials,
  ): Promise<string[]> {
    if (!isGitModule(module)) {
      return [];
    }
    const remoteUrl = buildRemoteUrl(module, credentials);
    return GitManager.listRemoteVersionTags(remoteUrl);
  }

  /**
   * Reads the version persisted in an installed module's own
   * `cardsConfig.json`. Returns undefined when the module is not
   * installed or the config is missing / unparseable.
   */
  public async readModuleVersion(
    moduleName: string,
  ): Promise<string | undefined> {
    const configPath = this.project.paths.moduleConfigurationFile(moduleName);
    try {
      const config = await readJsonFile(configPath);
      return config?.version;
    } catch {
      return undefined;
    }
  }
}

/** True when a module setting points at a git remote (HTTPS or SSH). */
function isGitModule(module: ModuleSetting): boolean {
  if (!module.location) return false;
  return (
    module.location.startsWith(HTTPS_PROTOCOL) ||
    module.location.startsWith('git@')
  );
}

/**
 * Build the remote URL for a module, injecting HTTPS credentials when the
 * source is private. Mirrors the resolver's logic but kept local so the
 * legacy facade has no cross-dependency on `modules/`.
 */
function buildRemoteUrl(
  module: ModuleSetting,
  credentials?: Credentials,
): string {
  if (
    module.private &&
    credentials?.username &&
    credentials?.token &&
    module.location.startsWith(HTTPS_PROTOCOL)
  ) {
    try {
      const repoUrl = new URL(module.location);
      return `https://${credentials.username}:${credentials.token}@${repoUrl.host}${repoUrl.pathname}`;
    } catch {
      throw new Error(`Invalid repository URL: ${module.location}`);
    }
  }
  return module.location;
}
