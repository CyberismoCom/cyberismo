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

import semver from 'semver';

import { declaredModules, installedModules } from './inventory.js';
import { isGitLocation } from './location.js';
import { ModuleRequestError, unreachable } from '../exceptions/index.js';
import { findOrphans } from './orphans.js';
import { buildRemoteUrl } from './remote-url.js';
import { conflictReason } from './resolve/format.js';
import { solve, type SolveOutcome } from './resolve/solver.js';
import type { SourceLayer } from './source.js';
import {
  toDeclaredRange,
  toVersion,
  type Source,
  type VersionSource,
} from './types.js';
import {
  isBreakingMove,
  pickVersion,
  validateVersionAgainstConstraints,
} from './version.js';

import type { Project } from '../containers/project.js';
import type {
  Credentials,
  UpdatePlan,
  UpdateTarget,
} from '../interfaces/project-interfaces.js';
import type { UpdateRequest } from './resolve/types.js';

function versionSourceOf(source: Source): VersionSource {
  if (source.private) return 'private';
  return isGitLocation(source.location) ? 'git' : 'file';
}

/**
 * The solver request `target` stands for; both a dry run and an update build
 * it here. Refuses a target the project cannot take before anything is solved.
 */
async function buildUpdateRequest(
  project: Project,
  source: SourceLayer,
  target: UpdateTarget,
  credentials?: Credentials,
): Promise<UpdateRequest> {
  const { module } = target;
  if (module === undefined) {
    if (declaredModules(project).length === 0) {
      throw new ModuleRequestError('invalid', 'No modules in the project!');
    }
    return { kind: 'updateAll' };
  }

  const declaration = declaredModules(project).find((d) => d.name === module);
  if (!declaration) {
    const parents = (await installedModules(project))
      .filter((m) => m.declaredDependencies.includes(module))
      .map((m) => m.name);
    if (parents.length > 0) {
      const parentList = parents.map((n) => `'${n}'`).join(', ');
      throw new ModuleRequestError(
        'invalid',
        `Cannot update module '${module}' because it is required by ${parentList}. Update the parent module(s) instead.`,
      );
    }
    throw new ModuleRequestError(
      'notFound',
      `Module '${module}' is not part of the project`,
    );
  }

  // Re-declaring the range is the upsert `install` does for a declared module.
  if (target.range !== undefined) {
    if (!isGitLocation(declaration.source.location)) {
      throw new ModuleRequestError(
        'invalid',
        `Module '${module}' is not installed from git, so it has no version range`,
      );
    }
    return {
      kind: 'add',
      name: module,
      source: declaration.source,
      range: toDeclaredRange(target.range),
    };
  }
  const { version } = target;
  if (version === undefined) return { kind: 'update', module };

  // The raw setting, so an invalid declared range refuses the version too.
  const declared = project.configuration.modules.find(
    (m) => m.name === module,
  )?.version;
  if (declared) {
    validateVersionAgainstConstraints(module, version, [
      { range: declared, source: 'project' },
    ]);
  }
  const remote = await source
    .listRemoteVersions(
      declaration.source.location,
      buildRemoteUrl(declaration.source, credentials),
    )
    .catch((error) => {
      throw unreachable(module, error);
    });
  const normalized = semver.valid(version);
  if (
    remote.length > 0 &&
    (normalized === null || !remote.includes(normalized))
  ) {
    throw new ModuleRequestError(
      'invalid',
      `Version '${version}' is not available for module '${module}'. ` +
        `Available versions: ${remote.join(', ') || 'none'}`,
    );
  }
  return { kind: 'update', module, to: toVersion(version) };
}

/** A solved update and the target it answers. */
export interface Resolution extends SolveOutcome {
  target: UpdateTarget;
}

/** Builds the request `target` stands for and solves it. The caller owns `source`. */
export async function resolveUpdate(
  project: Project,
  target: UpdateTarget,
  opts: { source: SourceLayer; credentials?: Credentials },
): Promise<Resolution> {
  const req = await buildUpdateRequest(
    project,
    opts.source,
    target,
    opts.credentials,
  );
  const outcome = await solve(project, req, opts.source, opts.credentials);
  return { ...outcome, target };
}

/** The consumer view of a {@link Resolution}. */
export async function toUpdatePlan(
  project: Project,
  { target, result, listed, unchecked, rangeWrites, assign }: Resolution,
): Promise<UpdatePlan> {
  const declared = declaredModules(project);
  const installations = await installedModules(project);
  const installed = new Map(installations.map((m) => [m.name, m.version]));
  const changes = result.ok ? result.changes : [];
  const moved = new Map(changes.map((c) => [c.module, c.to]));
  const written = new Map(rangeWrites.map((w) => [w.module, w.range]));

  const roots = declared
    .filter((d) => target.module === undefined || d.name === target.module)
    .map((d) => {
      const from = installed.get(d.name) ?? null;
      const to = moved.has(d.name) ? moved.get(d.name)! : from;
      const range = written.get(d.name) ?? d.versionRange ?? null;
      const latest = pickVersion(listed.get(d.name) ?? []) ?? null;
      return {
        module: d.name,
        installed: from,
        range,
        latest,
        heldBack:
          latest !== null &&
          range !== null &&
          to !== null &&
          !semver.satisfies(latest, range) &&
          semver.gt(latest, to),
        versionSource: versionSourceOf(d.source),
        ...(unchecked.has(d.name) ? { unchecked: true as const } : {}),
      };
    });

  if (!result.ok) {
    return {
      ok: false,
      changes: [],
      removed: [],
      conflicts: result.conflicts.map((c) => ({
        module: c.module,
        reason: conflictReason(c),
      })),
      rangeWrites: [],
      unchecked: [...unchecked],
      roots,
    };
  }

  // What cleanOrphans will find once the chosen versions are installed.
  const ownDeps = new Map(
    installations.map((m) => [m.name, m.declaredDependencies]),
  );
  const after = [...new Set([...ownDeps.keys(), ...moved.keys()])].map(
    (name) => ({
      name,
      declaredDependencies:
        assign.get(name)?.edges.map((e) => e.name) ?? ownDeps.get(name) ?? [],
    }),
  );
  const removed = findOrphans(
    declared.map((d) => d.name),
    after,
  ).map((m) => m.name);

  return {
    ok: true,
    // A versioned module that keeps its version is not a change.
    changes: changes
      .filter((c) => c.from === null || c.from !== c.to)
      .map((c) => ({
        module: c.module,
        from: c.from,
        to: c.to,
        breaking:
          c.from !== null && c.to !== null && isBreakingMove(c.from, c.to),
      })),
    removed,
    conflicts: [],
    rangeWrites,
    unchecked: [...unchecked],
    roots,
  };
}
