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
  conflictReason,
  declaredModules,
  installedModules,
  createSourceLayer,
  isGitLocation,
  pickVersion,
  requireDeclaredRoot,
  resolve,
  toVersion,
  validateExplicitTarget,
  type UpdateRequest,
} from '../modules/index.js';
import { getChildLogger } from '../utils/log-utils.js';

import type {
  Credentials,
  ModuleUpdateStatus,
  UpdatePreview,
} from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';
import type {
  ModuleDeclaration,
  ModuleInstallation,
} from '../modules/types.js';
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
    const ownsSource = !this.sourceLayer;
    const sourceLayer = this.sourceLayer ?? createSourceLayer();

    try {
      const declared = moduleName
        ? [
            await requireDeclaredRoot(
              this.project,
              moduleName,
              'check updates for',
            ),
          ]
        : declaredModules(this.project);

      const installed = await installedModules(this.project);
      const installedByName = new Map<string, ModuleInstallation>(
        installed.map((i) => [i.name, i]),
      );

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
              conflicts: plan.conflicts.map((c) => ({
                module: c.module,
                reason: conflictReason(c),
              })),
            } satisfies ModuleUpdateStatus;
          }

          const own = plan.changes.find((c) => c.module === decl.name);
          const latestAvailable = await latestBeyondRange(
            sourceLayer,
            decl,
            own?.to ?? installedVersion,
            credentials,
          );
          if (!own) {
            return {
              ...base,
              status: 'up_to_date',
              ...(latestAvailable ? { latestAvailable } : {}),
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
            ...(latestAvailable ? { latestAvailable } : {}),
          } satisfies ModuleUpdateStatus;
        }),
      );

      return results;
    } finally {
      if (ownsSource) await sourceLayer.dispose?.();
    }
  }

  /**
   * Computes the joint update plan without applying it: the same read-only
   * resolve an actual update would run, including transitive cascades and
   * conflicts.
   * @param moduleName Optional module to update. If omitted, plans for all.
   * @param version Optional exact target version; requires `moduleName`.
   * @param credentials Optional credentials for private modules.
   * @returns Either the set of moves the update would make, or what blocks it.
   */
  @read
  public async previewUpdate(
    moduleName?: string,
    version?: string,
    credentials?: Credentials,
  ): Promise<UpdatePreview> {
    if (version && !moduleName) {
      throw new Error('A target version requires a module name');
    }
    const ownsSource = !this.sourceLayer;
    const sourceLayer = this.sourceLayer ?? createSourceLayer();
    try {
      let req: UpdateRequest;
      if (moduleName) {
        const target = await requireDeclaredRoot(
          this.project,
          moduleName,
          'update',
        );
        if (version) {
          await validateExplicitTarget(
            this.project,
            sourceLayer,
            moduleName,
            target.source.location,
            version,
          );
          req = { kind: 'update', module: moduleName, to: toVersion(version) };
        } else {
          req = { kind: 'update', module: moduleName };
        }
      } else {
        req = { kind: 'updateAll' };
      }

      const plan = await resolve(this.project, req, {
        sourceLayer,
        credentials,
      });
      if (!plan.ok) {
        return {
          ok: false,
          changes: [],
          conflicts: plan.conflicts.map((c) => ({
            module: c.module,
            reason: conflictReason(c),
          })),
        };
      }
      return {
        ok: true,
        changes: plan.changes.map((c) => ({
          module: c.module,
          from: c.from,
          to: c.to,
          sealCount: c.replay.length,
        })),
        conflicts: [],
      };
    } finally {
      if (ownsSource) await sourceLayer.dispose?.();
    }
  }

  /**
   * Lists the versions a module source offers, newest first. Sources without
   * discrete versions (file sources) yield an empty list.
   * @param location Module source location (git URL or file path).
   * @returns Available versions in descending semver order.
   */
  public async availableVersions(location: string): Promise<string[]> {
    const ownsSource = !this.sourceLayer;
    const sourceLayer = this.sourceLayer ?? createSourceLayer();
    try {
      return await sourceLayer.listRemoteVersions(location);
    } finally {
      if (ownsSource) await sourceLayer.dispose?.();
    }
  }
}

/**
 * Newest remote version the declared range excludes — the informational
 * "held back" annotation for a successfully resolved row. A raw remote fact,
 * deliberately not solve-derived: it must fire even though staying put is a
 * valid solve. Best-effort — any listing failure yields undefined rather
 * than demoting a healthy row.
 */
async function latestBeyondRange(
  sourceLayer: SourceLayer,
  decl: ModuleDeclaration,
  baseline: string | undefined,
  credentials?: Credentials,
): Promise<{ version: string; range: string } | undefined> {
  if (!decl.versionRange || !baseline) return undefined;
  if (!isGitLocation(decl.source.location)) return undefined;
  try {
    const listed = await sourceLayer.listRemoteVersions(
      decl.source.location,
      buildRemoteUrl(decl.source, credentials),
    );
    const latest = pickVersion(listed);
    if (
      !latest ||
      semver.satisfies(latest, decl.versionRange) ||
      !semver.gt(latest, baseline)
    ) {
      return undefined;
    }
    return { version: latest, range: decl.versionRange };
  } catch {
    return undefined;
  }
}
