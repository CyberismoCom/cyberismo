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

import { ProjectPaths } from '../containers/project/project-paths.js';
import { readCardsConfig } from '../containers/project/cards-config.js';
import { buildRemoteUrl } from './remote-url.js';
import { pickVersion, satisfies, versionToTag } from './version.js';
import { toVersion, toVersionRange } from './types.js';
import type { SourceLayer } from './source.js';
import type {
  DiamondVersionConflict,
  ModuleDeclaration,
  Version,
} from './types.js';
import type {
  Credentials,
  ModuleSetting,
  ProjectSettings,
} from '../interfaces/project-interfaces.js';

/** A module declaration after the resolver has chosen a concrete version. */
export interface ResolvedModule {
  declaration: ModuleDeclaration;
  /** Git tag/branch to check out; undefined for file sources or unranged git. */
  ref?: string;
  /** Remote URL with credentials injected when needed; ready for `SourceLayer.fetch`. */
  remoteUrl: string;
  /** Resolved semver version; undefined when no concrete version was pinned. */
  version?: Version;
  /** Absolute path where the resolver staged this module's clone. */
  stagedPath: string;
}

/** Options consumed by {@link resolveModules}. */
export interface ResolveOptions {
  /** Injected into private HTTPS URLs before fetching. */
  credentials?: Credentials;
  /**
   * Name → exact version overrides. Returned verbatim; the caller is
   * responsible for validating the override against any declared range.
   */
  overrides?: Map<string, string>;
  /** Temp directory for intermediate clones; shared with the applier. */
  tempDir: string;
  /** Consumer for diamond conflict events; defaults to `console.warn`. */
  onConflict?: (event: DiamondVersionConflict) => void;
}

/**
 * Read a fetched module's `cardsConfig.json` from its base directory.
 * Exported so callers can read `cardKeyPrefix` before handing a pre-fetched
 * module to the resolver.
 *
 * @throws if the file does not exist or is empty, or if any name fails
 *         filesystem-safety validation.
 */
export async function readModuleConfig(
  basePath: string,
): Promise<ProjectSettings> {
  return readCardsConfig(new ProjectPaths(basePath).configurationFile);
}

/**
 * BFS walker over module declarations with first-encounter-wins semantics
 * per name. Diamond range mismatches fire `onConflict` rather than throwing.
 */
export async function resolveModules(
  source: SourceLayer,
  roots: ModuleDeclaration[],
  options: ResolveOptions,
): Promise<ResolvedModule[]> {
  const resolved = new Map<string, ResolvedModule>();
  const queue: ModuleDeclaration[] = [...roots];
  const onConflict =
    options.onConflict ??
    ((event) => {
      console.warn(
        `Diamond version conflict for module '${event.name}': ` +
          `installed version ${event.installedVersion.value} ` +
          `does not satisfy range '${event.rejectingRange}' ` +
          `(required by ${event.rejectingParent?.name ?? '<unknown parent>'})`,
      );
    });

  while (queue.length > 0) {
    const decl = queue.shift()!;

    if (decl.name === '') {
      // Callers must resolve the name before invoking the resolver.
      throw new Error(
        `Resolver encountered a declaration with an empty name ` +
          `for source '${decl.source.location}'. Callers must resolve ` +
          `the name before invoking the resolver.`,
      );
    }

    const existing = resolved.get(decl.name);

    if (existing) {
      assertSourceAgreement(existing, decl);

      if (
        decl.versionRange &&
        existing.version &&
        !satisfies(existing.version, decl.versionRange)
      ) {
        onConflict({
          project: decl.project,
          name: decl.name,
          installedVersion: { kind: 'pinned', value: existing.version },
          rejectingRange: decl.versionRange,
          rejectingParent: decl.parent,
        });
      }

      continue;
    }

    // First encounter: pick a version, fetch, and record.
    const remoteUrl = buildRemoteUrl(decl.source, options.credentials);
    const override = options.overrides?.get(decl.name);

    let version: Version | undefined;
    let ref: string | undefined;

    if (override !== undefined) {
      version = toVersion(override);
      ref = versionToTag(version);
    } else if (
      decl.versionRange &&
      source.supportsVersioning(decl.source.location)
    ) {
      const available = await source.listRemoteVersions(
        decl.source.location,
        remoteUrl,
      );
      if (available.length === 0) {
        throw new Error(
          `Module '${decl.name || decl.source.location}' has no available ` +
            `versions on the remote, but range '${decl.versionRange}' was ` +
            `requested. Publish a matching tag or remove the version range.`,
        );
      }
      const picked = pickVersion(available, decl.versionRange);
      if (!picked) {
        throw new Error(
          `No version satisfies range '${decl.versionRange}' for module ` +
            `'${decl.name || decl.source.location}'`,
        );
      }
      version = picked;
      ref = versionToTag(version);
    }
    // No override, no range, or unversioned source → leave version/ref
    // undefined (default branch for git, no-op for file sources).

    const path = await source.fetch(
      { location: decl.source.location, remoteUrl, ref },
      options.tempDir,
      decl.name,
    );
    const childConfig = await readModuleConfig(path);

    const resolvedEntry: ResolvedModule = {
      declaration: { ...decl },
      ref,
      remoteUrl,
      version,
      stagedPath: path,
    };
    resolved.set(decl.name, resolvedEntry);

    const childDecls = childConfig.modules ?? [];
    for (const child of childDecls) {
      queue.push(toChildDeclaration(decl.project, decl.name, child));
    }
  }

  return Array.from(resolved.values());
}

/** @throws when two declarations for the same name disagree on location/private. */
function assertSourceAgreement(
  existing: ResolvedModule,
  decl: ModuleDeclaration,
): void {
  const existingPrivate = existing.declaration.source.private ?? false;
  const declPrivate = decl.source.private ?? false;
  if (
    existing.declaration.source.location !== decl.source.location ||
    existingPrivate !== declPrivate
  ) {
    throw new Error(
      `Conflicting source for module '${decl.name}': ` +
        `installed from '${existing.declaration.source.location}' ` +
        `(private=${existingPrivate}), but also declared with ` +
        `'${decl.source.location}' (private=${declPrivate})`,
    );
  }
}

/** Build a transitive declaration from a child `ModuleSetting`. */
function toChildDeclaration(
  projectId: string,
  parentName: string,
  child: ModuleSetting,
): ModuleDeclaration {
  const versionRange =
    child.version && child.version.length > 0
      ? toVersionRange(child.version)
      : undefined;

  return {
    project: projectId,
    name: child.name,
    source: {
      location: child.location,
      private: child.private ?? false,
    },
    versionRange,
    parent: { project: projectId, name: parentName },
  };
}
