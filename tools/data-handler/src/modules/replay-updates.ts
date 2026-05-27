/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { Project } from '../containers/project.js';
import {
  ModuleUpdater,
  type UpdateRequest,
} from '../mutations/module-update/plan.js';
import type {
  ModuleUpdateResult,
  ReplayConflict,
} from '../mutations/module-update/types.js';
import { installedVersion } from './inventory.js';
import type { ResolvedModule } from './resolver.js';

/**
 * Thrown by {@link replayResolvedUpdates} when `ModuleUpdater.previewUpdate`
 * reports one or more migration-path conflicts (e.g. diverged branches, a
 * missing intermediate sealed log). Carrying the structured conflicts lets
 * callers — CLI, HTTP, future UI — render them without parsing strings.
 */
export class ModuleReplayConflictError extends Error {
  constructor(
    public readonly conflicts: ReplayConflict[],
    /** Module that triggered the user-facing call, for error context. */
    public readonly module?: string,
  ) {
    const prefix = module ? `Cannot update ${module}: ` : 'Cannot update: ';
    super(prefix + conflicts.map((c) => c.description).join('; '));
    this.name = 'ModuleReplayConflictError';
  }
}

/**
 * Thrown by {@link replayResolvedUpdates} when {@link ModuleUpdater.applyUpdate}
 * returns `status: 'failed'` — i.e. one of the replay's log entries threw
 * mid-cascade. The on-disk state is partially mutated; recovery is `git
 * restore`. Carrying the structured result lets the dispatcher surface a
 * non-200 status and the CLI print the failure summary instead of reporting
 * a phantom success.
 */
export class ModuleReplayFailedError extends Error {
  constructor(
    public readonly result: ModuleUpdateResult,
    /** Module that triggered the user-facing call, for error context. */
    public readonly module?: string,
  ) {
    const summary =
      result.failureSummary ?? 'Replay failed at step ' + result.failedAtStep;
    const prefix = module
      ? `Module update for ${module} failed: `
      : 'Module update failed: ';
    super(prefix + summary);
    this.name = 'ModuleReplayFailedError';
  }
}

/**
 * Thrown when a module update leaves the project with referential
 * validation errors. This is the implementation of the spec's
 * `project_content_valid` gate (see migration-system.allium,
 * `SuccessImpliesValidProject`): replay applies entries mechanically and the
 * resulting content is judged once, as the update's last step. The project
 * is assumed valid going in, so any error afterward fails the update.
 *
 * Recovery: under `--autocommit` the write transaction's onWriteError hook
 * rolls the project back to the last commit when this throws; otherwise the
 * partial state remains on disk and the user runs `git restore`.
 */
export class ModuleValidationFailedError extends Error {
  constructor(
    public readonly validationErrors: string[],
    /** Module that triggered the user-facing call, for error context. */
    public readonly module?: string,
  ) {
    const prefix = module
      ? `Module update for ${module} left the project invalid: `
      : 'Module update left the project invalid: ';
    super(prefix + validationErrors.join('; '));
    this.name = 'ModuleValidationFailedError';
  }
}

/**
 * Snapshot each resolved module's currently-installed version *before*
 * `applyModules` overwrites its `cardsConfig.json`. Bootstrap installs
 * (no prior version on disk) map to `null` and contribute no replay step.
 *
 * Must be called before `applyModules`; otherwise every entry reads back
 * as the newly-written version and replay degenerates to a no-op.
 */
export async function snapshotInstalledVersions(
  project: Project,
  resolved: ResolvedModule[],
): Promise<Map<string, string | null>> {
  const entries = await Promise.all(
    resolved.map(async (r) => {
      const prefix = r.declaration.name;
      return [prefix, await installedVersion(project, prefix)] as const;
    }),
  );
  return new Map(entries);
}

/**
 * Run the migration engine over a freshly-applied resolver result. Builds
 * one {@link UpdateRequest} per entry whose version actually changed, runs
 * the combined preview, and applies it.
 *
 * Returns `null` when no entry changed version (a pure re-resolve, or a
 * bootstrap-only batch where every entry was new and so has no log chain
 * to replay against existing consumer state).
 *
 * @throws {ModuleReplayConflictError} when the preview reports conflicts.
 */
export async function replayResolvedUpdates(
  project: Project,
  resolved: ResolvedModule[],
  fromVersionByPrefix: Map<string, string | null>,
  options?: { module?: string },
): Promise<ModuleUpdateResult | null> {
  const requests: UpdateRequest[] = [];
  for (const r of resolved) {
    if (r.version === undefined) continue;
    const prefix = r.declaration.name;
    const fromVersion = fromVersionByPrefix.get(prefix) ?? null;
    // Bootstrap install: the freshly-applied module's resources already
    // reflect `toVersion`'s post-migration state, so replaying its log
    // chain would double-apply. Skip — see `snapshotInstalledVersions`.
    if (fromVersion === null) continue;
    if (fromVersion === r.version) continue;
    requests.push({ prefix, fromVersion, toVersion: r.version });
  }

  if (requests.length === 0) return null;

  const updater = new ModuleUpdater(project);
  const preview = await updater.previewUpdate(requests);
  if (preview.conflicts.length > 0) {
    throw new ModuleReplayConflictError(preview.conflicts, options?.module);
  }
  const result = await updater.applyUpdate(preview);
  if (result.status === 'failed') {
    throw new ModuleReplayFailedError(result, options?.module);
  }
  return result;
}
