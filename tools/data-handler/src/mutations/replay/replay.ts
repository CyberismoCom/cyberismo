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

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import semver from 'semver';

import { ProjectPaths } from '../../containers/project/project-paths.js';
import { ResourceMutations } from '../resource-mutations.js';
import { checkLinearity, computeChain } from './chain.js';
import { entryToMutationInput } from './convert.js';
import { listSealFiles } from './seal-files.js';

import { CONFIGURATION_OPERATIONS } from '../../utils/configuration-logger.js';

import type { ConfigurationLogEntry } from '../../utils/configuration-logger.js';
import type { ModuleInstallation } from '../../modules/types.js';
import type { MutationInput } from '../types.js';
import type { Project } from '../../containers/project.js';
import type { ResolvedModule } from '../../modules/resolver.js';
import type { SealFile } from './seal-files.js';

/** A reason one module's update cannot be replayed safely. */
export interface ReplayConflict {
  modulePrefix: string;
  kind: 'non_linear' | 'downgrade' | 'chain_gap';
  detail: string;
}

/** One seal's worth of replayable log entries, in file order. */
export interface ReplaySeal {
  seal: SealFile;
  entries: ConfigurationLogEntry[];
}

/** The replay work for one module update, seals ascending by version. */
export interface ReplayStep {
  /** The module's resolved (post-update) prefix. */
  modulePrefix: string;
  fromVersion: string;
  toVersion: string;
  seals: ReplaySeal[];
}

/**
 * Thrown by {@link planModuleReplays} when one or more modules cannot be
 * replayed. All conflicts across all modules are collected first so the
 * user sees every problem at once; planning never touches the project,
 * so nothing needs to be rolled back.
 */
export class ModuleReplayConflictError extends Error {
  constructor(readonly conflicts: ReplayConflict[]) {
    const lines = conflicts.map(
      (c) => `  - module '${c.modulePrefix}' (${c.kind}): ${c.detail}`,
    );
    super(
      `Module update blocked by ${conflicts.length} migration conflict(s):\n` +
        `${lines.join('\n')}\n` +
        `No files were changed.`,
    );
    this.name = 'ModuleReplayConflictError';
  }
}

/**
 * Thrown by {@link executeModuleReplays} on the first entry whose
 * conversion or apply fails. By this point module files have already been
 * overwritten and earlier cascades have run, so recovery is via git.
 */
export class ModuleReplayFailedError extends Error {
  constructor(
    readonly modulePrefix: string,
    readonly sealFileName: string,
    /** 1-based position of the failing entry within its seal file. */
    readonly sequence: number,
    cause: unknown,
    /** The converted mutation; undefined when the conversion itself failed. */
    readonly input?: MutationInput,
  ) {
    super(
      `Module replay failed for module '${modulePrefix}', ` +
        `seal '${sealFileName}', entry ${sequence}` +
        `${input ? `, mutation: ${JSON.stringify(input)}` : ''}: ` +
        `${cause instanceof Error ? cause.message : String(cause)}. ` +
        `The project may be partially migrated; restore the previous state ` +
        `from git if it was not rolled back automatically.`,
      { cause },
    );
    this.name = 'ModuleReplayFailedError';
  }
}

/**
 * Thrown by the module-update transaction when the project fails
 * validation after replays ran. The module update and its replays have
 * already been applied to disk.
 */
export class ModuleValidationFailedError extends Error {
  /** Summary of the replay chains that ran before validation failed. */
  readonly steps: {
    modulePrefix: string;
    fromVersion: string;
    toVersion: string;
  }[];

  constructor(
    readonly validationErrors: string,
    executedSteps: ReplayStep[],
  ) {
    const steps = executedSteps.map(
      ({ modulePrefix, fromVersion, toVersion }) => ({
        modulePrefix,
        fromVersion,
        toVersion,
      }),
    );
    const summary = steps.map(
      (s) => `  replayed ${s.modulePrefix} ${s.fromVersion} → ${s.toVersion}`,
    );
    super(
      `The module update was applied, but the project failed validation afterwards:\n` +
        `${validationErrors}\n` +
        `${summary.join('\n')}\n` +
        `Review the errors above, or restore the previous state from git ` +
        `if it was not rolled back automatically.`,
    );
    this.steps = steps;
    this.name = 'ModuleValidationFailedError';
  }
}

/**
 * Plan the replay chains for a module update.
 *
 * Installed and resolved modules are correlated by source location, never
 * by prefix, so a module that renamed its prefix is still recognized as an
 * update (and the step carries the new prefix). Installed entries with an
 * empty location (transitive installations whose source is not persisted)
 * cannot be correlated and are treated as bootstraps.
 *
 * Seal CONTENTS are read here, from each module's STAGED tree: applying
 * the staged modules moves the staged folder away (rename swap), so the
 * files are gone by execution time. A malformed seal line is a strict
 * plan-time error (not a conflict): planning precedes any disk change, so
 * aborting is the safe direction.
 *
 * The resolver yields roots before their transitive dependencies (BFS);
 * steps are produced in REVERSE resolved order so dependencies replay
 * before their dependents.
 *
 * Skips (no step, no conflict): module not installed before, installed or
 * resolved version unknown, version unchanged, or no seal covers the range.
 *
 * @throws ModuleReplayConflictError aggregating every conflicted module.
 * @throws Error on a malformed seal line (module, seal and line are named).
 */
export async function planModuleReplays(
  resolved: ResolvedModule[],
  installedBefore: ModuleInstallation[],
): Promise<ReplayStep[]> {
  const installedBySource = new Map<string, ModuleInstallation>();
  for (const installation of installedBefore) {
    const location = installation.source.location;
    if (location !== '' && !installedBySource.has(location)) {
      installedBySource.set(location, installation);
    }
  }

  const conflicts: ReplayConflict[] = [];
  const steps: ReplayStep[] = [];

  for (const entry of [...resolved].reverse()) {
    const modulePrefix = entry.declaration.name;
    const installed = installedBySource.get(entry.declaration.source.location);
    if (!installed?.version) continue; // bootstrap: nothing to replay
    const to = entry.version;
    if (to === undefined) continue;
    const from = installed.version;
    if (semver.eq(from, to)) continue;
    if (semver.gt(from, to)) {
      conflicts.push({
        modulePrefix,
        kind: 'downgrade',
        detail: `installed version ${from} is newer than target version ${to}`,
      });
      continue;
    }

    const installedSeals = await listSealFiles(
      join(installed.path, 'migrations'),
    );
    const stagedMigrations = new ProjectPaths(entry.stagedPath)
      .migrationLogFolder;
    const targetSeals = await listSealFiles(stagedMigrations);

    const missing = checkLinearity(installedSeals, targetSeals);
    if (missing.length > 0) {
      conflicts.push({
        modulePrefix,
        kind: 'non_linear',
        detail: `target tree is missing installed seal(s): ${missing.join(', ')}`,
      });
      continue;
    }

    let chain: SealFile[];
    try {
      chain = computeChain(targetSeals, from, to);
    } catch (error) {
      conflicts.push({
        modulePrefix,
        kind: 'chain_gap',
        detail: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (chain.length === 0) continue;

    const seals: ReplaySeal[] = [];
    for (const seal of chain) {
      seals.push({
        seal,
        entries: await readSealEntries(modulePrefix, stagedMigrations, seal),
      });
    }
    steps.push({ modulePrefix, fromVersion: from, toVersion: to, seals });
  }

  if (conflicts.length > 0) {
    throw new ModuleReplayConflictError(conflicts);
  }
  return steps;
}

/**
 * Split planned steps by whether their module's apply actually landed
 * (`applyModules` logs-and-continues on per-module failures). Replaying a
 * chain whose module files were never overwritten would cascade renames
 * the installed files do not reflect, so dropped steps must be skipped
 * (and surfaced to the user) by the caller.
 */
export function filterStepsToApplied(
  steps: ReplayStep[],
  appliedModules: string[],
): { executable: ReplayStep[]; dropped: ReplayStep[] } {
  const applied = new Set(appliedModules);
  const executable: ReplayStep[] = [];
  const dropped: ReplayStep[] = [];
  for (const step of steps) {
    (applied.has(step.modulePrefix) ? executable : dropped).push(step);
  }
  return { executable, dropped };
}

/**
 * Execute planned replay chains against the host project.
 *
 * Steps run in plan order (dependencies first), seals ascending within a
 * step, entries in file order. Each entry is converted to a MutationInput
 * and applied with origin `{ kind: 'replay', modulePrefix }`, which runs
 * only the handler cascade and never writes the host's migration log.
 *
 * Cascades write directly to disk; per the applyCascade contract this
 * orchestrator owns cache refreshing. The refresh runs ONCE after all
 * chains complete (not per module) so repeated repopulation is avoided.
 * On failure the refresh is skipped: the error directs the user to
 * restore via git, after which a fresh Project is constructed anyway.
 *
 * @throws ModuleReplayFailedError on the first failing entry.
 */
export async function executeModuleReplays(
  project: Project,
  steps: ReplayStep[],
): Promise<void> {
  if (steps.length === 0) return;

  const mutations = new ResourceMutations(project);
  for (const step of steps) {
    for (const { seal, entries } of step.seals) {
      for (const [index, entry] of entries.entries()) {
        let input: MutationInput | undefined;
        try {
          input = entryToMutationInput(entry);
          await mutations.apply(input, {
            kind: 'replay',
            modulePrefix: step.modulePrefix,
          });
        } catch (error) {
          throw new ModuleReplayFailedError(
            step.modulePrefix,
            seal.fileName,
            index + 1,
            error,
            input,
          );
        }
      }
    }
  }

  project.resources.changed();
  project.cardsCache.clear();
  await project.populateCaches();
}

async function readSealEntries(
  modulePrefix: string,
  migrationsFolder: string,
  seal: SealFile,
): Promise<ConfigurationLogEntry[]> {
  const content = await readFile(
    join(migrationsFolder, seal.fileName),
    'utf-8',
  );
  const lines = content.split('\n');
  const entries: ConfigurationLogEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(
        malformedLine(modulePrefix, seal.fileName, i + 1, 'not valid JSON'),
        { cause: error },
      );
    }
    if (!isLogEntry(parsed)) {
      throw new Error(
        malformedLine(
          modulePrefix,
          seal.fileName,
          i + 1,
          'missing operation or target',
        ),
      );
    }
    // An unrecognized operation (e.g. written by a future format) must
    // fail here at plan time, before any disk change — not as a
    // TypeError mid-replay.
    if (!isKnownOperation(parsed.operation)) {
      throw new Error(
        malformedLine(
          modulePrefix,
          seal.fileName,
          i + 1,
          `unknown operation '${parsed.operation}'`,
        ),
      );
    }
    entries.push(parsed);
  }
  return entries;
}

function malformedLine(
  modulePrefix: string,
  sealFileName: string,
  line: number,
  reason: string,
): string {
  return (
    `Malformed migration log entry in module '${modulePrefix}', ` +
    `seal '${sealFileName}', line ${line}: ${reason}`
  );
}

function isLogEntry(value: unknown): value is ConfigurationLogEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { operation?: unknown }).operation === 'string' &&
    typeof (value as { target?: unknown }).target === 'string'
  );
}

function isKnownOperation(operation: string): boolean {
  return (CONFIGURATION_OPERATIONS as readonly string[]).includes(operation);
}
