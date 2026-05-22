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

import { join } from 'node:path';

import semver from 'semver';

import type { Project } from '../../containers/project.js';
import { ProjectPaths } from '../../containers/project/project-paths.js';
import { sealedMigrationVersions } from '../../modules/inventory.js';
import { detectMigrationPathConflicts } from './conflicts.js';
import { replayLog } from './replay.js';
import type {
  ModuleUpdatePreview,
  ModuleUpdateResult,
  ReplayConflict,
  ResolvedUpdateStep,
  StepReplayResult,
} from './types.js';

/**
 * One pending migration replay: walks `prefix` from `fromVersion` to
 * `toVersion`. `fromVersion === null` is a bootstrap install (no prior
 * version, no logs to replay).
 */
export interface UpdateRequest {
  prefix: string;
  fromVersion: string | null;
  toVersion: string;
}

/**
 * Coordinates module-update migration replay on top of the existing
 * mutation dispatcher. `previewUpdate` reports the planned steps for a
 * batch (one step per module whose version is changing) and any blocking
 * conflicts; `applyUpdate` runs the replay in step order.
 *
 * Each request's `fromVersion` must be captured by the caller *before*
 * `applyModules` overwrites the installed module's `cardsConfig.json`.
 * `installedVersion` from `src/modules/inventory.ts` is the standard
 * capture primitive.
 */
export class ModuleUpdater {
  constructor(private project: Project) {}

  /**
   * Build a preview for a batch of module updates. Each request becomes
   * one `ResolvedUpdateStep` (in input order); conflicts from every step
   * are aggregated into a single `conflicts` array. Requests whose
   * `fromVersion === toVersion` are skipped (no-op).
   */
  async previewUpdate(
    requests: UpdateRequest[],
  ): Promise<ModuleUpdatePreview> {
    const steps: ResolvedUpdateStep[] = [];
    const conflicts: ReplayConflict[] = [];

    let order = 0;
    for (const req of requests) {
      if (req.fromVersion === req.toVersion) continue;

      const availableSealed = await this.availableSealedVersions(req.prefix);
      const logChain = this.computeLogChain(
        req.fromVersion,
        req.toVersion,
        availableSealed,
      );
      const crossesMajorBoundary =
        req.fromVersion !== null &&
        semver.major(req.fromVersion) !== semver.major(req.toVersion);

      order += 1;
      steps.push({
        order,
        modulePrefix: req.prefix,
        fromVersion: req.fromVersion,
        toVersion: req.toVersion,
        logChain,
        crossesMajorBoundary,
      });

      conflicts.push(
        ...detectMigrationPathConflicts({
          modulePrefix: req.prefix,
          fromVersion: req.fromVersion,
          toVersion: req.toVersion,
          availableSealedVersions: availableSealed,
        }),
      );
    }

    return {
      steps,
      conflicts,
      totalEntryCount: 0,
      affectedCardCount: 0,
      dataLossExpected: false,
    };
  }

  /**
   * Apply a previously-built preview. Walks each step's log chain through
   * `replayLog`. Refuses to start when the preview reports conflicts; on
   * the first per-step failure the partial state remains on disk (recovery
   * is `git restore`). Success leaves no bookkeeping on disk — the
   * installed module's own `cardsConfig.json` (written by `applyModules`)
   * is the source of truth for the new state.
   */
  async applyUpdate(
    preview: ModuleUpdatePreview,
  ): Promise<ModuleUpdateResult> {
    if (preview.conflicts.length > 0) {
      throw new Error(
        `Cannot apply update: ${preview.conflicts.length} conflict(s). ` +
          preview.conflicts.map((c) => c.description).join('; '),
      );
    }

    const stepResults: StepReplayResult[] = [];

    for (const step of preview.steps) {
      for (const v of step.logChain) {
        const logPath = this.sealedLogPath(step.modulePrefix, v);
        const replay = await replayLog(this.project, logPath);
        replay.modulePrefix = step.modulePrefix;
        replay.fromVersion = step.fromVersion;
        replay.toVersion = step.toVersion;

        if (replay.status === 'failed') {
          stepResults.push(replay);
          return {
            status: 'failed',
            steps: stepResults,
            failedAtStep: step.order,
            failureSummary: replay.failureSummary,
          };
        }
      }

      stepResults.push({
        modulePrefix: step.modulePrefix,
        fromVersion: step.fromVersion,
        toVersion: step.toVersion,
        status: 'succeeded',
      });
    }

    return { status: 'succeeded', steps: stepResults };
  }

  /**
   * Path to a sealed migration log for the given module prefix and version.
   */
  private sealedLogPath(modulePrefix: string, version: string): string {
    const paths = new ProjectPaths(this.project.basePath);
    const folder =
      modulePrefix === this.project.projectPrefix
        ? paths.migrationLogFolder
        : join(paths.modulesFolder, modulePrefix, 'migrations');
    return join(folder, `migrationLog_${version}.jsonl`);
  }

  /**
   * Sealed log versions strictly greater than `fromVersion` (or 0.0.0 when
   * bootstrapping) and less than or equal to `toVersion`, sorted ascending.
   */
  private computeLogChain(
    fromVersion: string | null,
    toVersion: string,
    available: string[],
  ): string[] {
    const lower = fromVersion ?? '0.0.0';
    return available
      .filter((v) => semver.gt(v, lower) && semver.lte(v, toVersion))
      .sort(semver.compare);
  }

  /**
   * List all sealed log versions known on disk for `modulePrefix`. Local
   * (project-owned) prefixes resolve to `.cards/local/migrations`; foreign
   * prefixes resolve to `.cards/modules/<prefix>/migrations`.
   */
  private async availableSealedVersions(
    modulePrefix: string,
  ): Promise<string[]> {
    const paths = new ProjectPaths(this.project.basePath);
    const folder =
      modulePrefix === this.project.projectPrefix
        ? paths.migrationLogFolder
        : join(paths.modulesFolder, modulePrefix, 'migrations');
    return sealedMigrationVersions(folder);
  }
}
