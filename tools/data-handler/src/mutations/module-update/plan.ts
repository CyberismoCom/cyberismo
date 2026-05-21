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

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import semver from 'semver';

import type { Project } from '../../containers/project.js';
import { ProjectPaths } from '../../containers/project/project-paths.js';
import { readAppliedModules, recordModuleApplied } from './applied-modules.js';
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
 * Coordinates the per-module update flow on top of the existing mutation
 * dispatcher. `previewUpdate` reports the planned steps and any blocking
 * conflicts; `applyUpdate` (added in a later task) runs the replay.
 */
export class ModuleUpdater {
  constructor(private project: Project) {}

  /**
   * Build a preview for upgrading `rootModulePrefix` to `rootToVersion` from
   * the project's currently-applied state. The preview is empty when the
   * module is already at the requested version.
   */
  async previewUpdate(
    rootModulePrefix: string,
    rootToVersion: string,
  ): Promise<ModuleUpdatePreview> {
    const applied = await readAppliedModules(this.project.basePath);
    const fromVersion =
      applied.find((m) => m.prefix === rootModulePrefix)?.appliedVersion ??
      null;

    const steps: ResolvedUpdateStep[] = [];
    const conflicts: ReplayConflict[] = [];

    if (fromVersion === rootToVersion) {
      return {
        steps,
        conflicts,
        totalEntryCount: 0,
        affectedCardCount: 0,
        dataLossExpected: false,
      };
    }

    const availableSealed = await this.availableSealedVersions(
      rootModulePrefix,
    );
    const logChain = this.computeLogChain(
      fromVersion,
      rootToVersion,
      availableSealed,
    );
    const crossesMajorBoundary =
      fromVersion !== null &&
      semver.major(fromVersion) !== semver.major(rootToVersion);

    steps.push({
      order: 1,
      modulePrefix: rootModulePrefix,
      fromVersion,
      toVersion: rootToVersion,
      logChain,
      crossesMajorBoundary,
    });

    conflicts.push(
      ...detectMigrationPathConflicts({
        modulePrefix: rootModulePrefix,
        fromVersion,
        toVersion: rootToVersion,
        availableSealedVersions: availableSealed,
      }),
    );

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
   * `replayLog`, then records the new applied version. Refuses to start
   * when the preview reports conflicts; on the first per-step failure the
   * partial state remains on disk (recovery is `git restore`).
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

      await recordModuleApplied(
        this.project.basePath,
        step.modulePrefix,
        step.toVersion,
      );
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

    let files: string[];
    try {
      files = await readdir(folder);
    } catch {
      return [];
    }
    return files
      .map((f) => /^migrationLog_(.+)\.jsonl$/.exec(f)?.[1])
      .filter((v): v is string => !!v && semver.valid(v) !== null);
  }
}
