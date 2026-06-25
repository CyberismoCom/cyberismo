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

import { read } from '../utils/rw-lock.js';
import {
  declaredModules,
  installedModules,
  createSourceLayer,
  isGitLocation,
  resolve,
} from '../modules/index.js';
import { getChildLogger } from '../utils/log-utils.js';

import type {
  Credentials,
  ModuleUpdateStatus,
} from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';
import type { ModuleInstallation } from '../modules/types.js';
import type { SourceLayer } from '../modules/source.js';

/**
 * Handles checking for module updates.
 */
export class CheckUpdates {
  private get logger() {
    return getChildLogger({ module: 'check-updates' });
  }

  constructor(
    private project: Project,
    private sourceLayer?: SourceLayer,
  ) {}

  /**
   * Checks for available updates for all or a specific module.
   *
   * The status of each module is computed through the resolver engine in a
   * read-only `availability` query, so it reflects exactly what an actual
   * update would do — including transitive cascades and conflicts.
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
    const sourceLayer = this.sourceLayer ?? createSourceLayer();

    const allDeclared = declaredModules(this.project);
    const declared = moduleName
      ? allDeclared.filter((d) => d.name === moduleName)
      : allDeclared;

    const installed = await installedModules(this.project);
    const installedByName = new Map<string, ModuleInstallation>(
      installed.map((i) => [i.name, i]),
    );

    if (moduleName && declared.length === 0) {
      const parents = installed
        .filter((m) => m.declaredDependencies.includes(moduleName))
        .map((m) => m.name);
      if (parents.length > 0) {
        const parentList = parents.map((n) => `'${n}'`).join(', ');
        throw new Error(
          `Cannot check updates for module '${moduleName}' because it is required by ${parentList}. Check updates for the parent module(s) instead.`,
        );
      }
      throw new Error(`Module '${moduleName}' is not part of the project`);
    }

    const results = await Promise.all(
      declared.map(async (decl) => {
        const installation = installedByName.get(decl.name);
        const installedVersion = installation?.version;
        const isGitModule = isGitLocation(decl.source.location);

        const base = {
          name: decl.name,
          installedVersion,
          isGitModule,
        };

        let plan;
        try {
          plan = await resolve(
            this.project,
            { kind: 'availability', module: decl.name },
            { sourceLayer, credentials },
          );
        } catch (err) {
          // Unreachable remote / fetch failure — distinguish from up-to-date.
          this.logger.warn(
            `check-updates: source unreachable for '${decl.name}': ${err instanceof Error ? err.message : String(err)}`,
          );
          return {
            ...base,
            status: 'source_unreachable',
          } satisfies ModuleUpdateStatus;
        }

        if (!plan.ok) {
          return {
            ...base,
            status: 'blocked',
            blocked: plan.conflicts,
          } satisfies ModuleUpdateStatus;
        }

        const own = plan.changes.find((c) => c.module === decl.name);
        if (!own) {
          return {
            ...base,
            status: 'up_to_date',
          } satisfies ModuleUpdateStatus;
        }

        return {
          ...base,
          status: 'update_available',
          reachableVersion: own.to ?? undefined,
          cascade: plan.changes.map((c) => ({
            module: c.module,
            from: c.from,
            to: c.to,
          })),
        } satisfies ModuleUpdateStatus;
      }),
    );

    return results;
  }
}
