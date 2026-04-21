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
import { readJsonFile } from '../utils/json.js';
import { buildRemoteUrl } from './credentials.js';
import { isFileLocation, isGitLocation } from './location.js';
import { pickVersion, satisfies, versionToTag } from './version.js';
import { toVersion, toVersionRange } from './types.js';
import type { SourceLayer } from './source.js';
import type {
  DiamondVersionConflict,
  ModuleDeclaration,
  Version,
  VersionRange,
} from './types.js';
import type {
  Credentials,
  ModuleSetting,
} from '../interfaces/project-interfaces.js';
import type { ProjectConfiguration } from '../project-settings.js';

/**
 * A module declaration after the resolver has chosen a concrete version
 * (or determined that no version applies). Mirrors the output of the
 * spec's `ReconcileTransitives` rule: one entry per reachable name.
 */
export interface ResolvedModule {
  /**
   * The declaration that produced this resolution. For transitive
   * declarations, `parent` points at the installation that owns the
   * declaration. The resolver uses the declaration's name verbatim; the
   * empty-name case is resolved via the module's own `cardKeyPrefix` and
   * the result is reflected here.
   */
  declaration: ModuleDeclaration;
  /**
   * Git tag (or branch name) to check out. Undefined for file sources
   * and for declarations without a `versionRange` — in the latter case
   * the remote's default branch is cloned at fetch time.
   */
  ref?: string;
  /**
   * Remote URL with credentials injected when the source is private and
   * HTTPS. For non-git or non-private sources this is the declaration's
   * `location` verbatim. Ready to pass to `SourceLayer.fetch`.
   */
  remoteUrl: string;
  /**
   * Resolved semver version, when one was chosen. Undefined for file
   * sources and for git sources without a declared range where the
   * default branch is used (no concrete version is pinned).
   */
  version?: Version;
}

/**
 * Options consumed by {@link Resolver.resolve}. All are optional bar
 * `tempDir`, which the resolver shares with the installer so that
 * intermediate clones can be reused downstream.
 */
export interface ResolveOptions {
  /**
   * Credentials used for private HTTPS remotes. When present and the
   * declaration marks its source `private`, the resolver injects the
   * username/token into the URL before handing it to the source layer.
   */
  credentials?: Credentials;
  /**
   * Override version selection for specific modules (name → exact
   * version). Used when the caller already knows the target, e.g.
   * `update-modules X 1.2.3`. Returned verbatim — the resolver does not
   * re-check an override against any declared range; the caller is
   * responsible for validating the override.
   */
  overrides?: Map<string, string>;
  /**
   * Temp directory used for intermediate clones. Shared with the
   * installer when possible so that its two-phase apply can reuse the
   * staged copies.
   */
  tempDir: string;
  /**
   * Optional consumer for {@link DiamondVersionConflict} events. The
   * spec treats diamond range mismatches as warnings rather than hard
   * errors — the first resolution wins and later declarations whose
   * range rejects it produce a structured event here. Defaults to
   * `console.warn` when absent.
   */
  onConflict?: (event: DiamondVersionConflict) => void;
}

/**
 * Read a fetched module's `cardsConfig.json`. Only `cardKeyPrefix` and
 * `modules` are consumed by the resolver; the rest of the shape is not
 * inspected here. The returned value is cast to the concrete
 * {@link ProjectConfiguration} type for documentation, but no class
 * methods are invoked.
 *
 * The config file lives at `<path>/.cards/local/cardsConfig.json` —
 * mirrored by {@link ProjectPaths.configurationFile}.
 */
async function readConfig(path: string): Promise<ProjectConfiguration> {
  const configPath = new ProjectPaths(path).configurationFile;
  const config = (await readJsonFile(configPath)) as
    | ProjectConfiguration
    | undefined;
  if (!config) {
    throw new Error(`Module has no cardsConfig.json at '${configPath}'`);
  }
  return config;
}

/**
 * Implements the module-resolution half of the spec's
 * `ReconcileTransitives` rule: BFS over declarations with
 * first-encounter-wins semantics on each name. Does not mutate the
 * project state.
 *
 * Throws on:
 *  - A later declaration whose source `location` or `private` flag
 *    differs from the first encountered for the same name (spec
 *    invariant `DeclarationAndInstallationAgreeOnSource`).
 *  - No remote version satisfying a declared range when no override
 *    was provided.
 *  - Invalid remote URL when injecting credentials.
 *
 * Diamond range mismatches do not throw — they are reported through
 * `onConflict` (or `console.warn` when absent).
 */
export class Resolver {
  constructor(private readonly source: SourceLayer) {}

  /**
   * Resolve a set of root declarations plus every transitive
   * declaration reachable via their `cardsConfig.json`. Returns one
   * {@link ResolvedModule} per unique name encountered during the walk.
   */
  async resolve(
    roots: ModuleDeclaration[],
    options: ResolveOptions,
  ): Promise<ResolvedModule[]> {
    const resolved = new Map<string, ResolvedModule>();
    const queue: ModuleDeclaration[] = [...roots];
    const onConflict =
      options.onConflict ??
      ((event) => {
        // Default: log to stderr. CLI wrappers typically provide their
        // own handler; this is a safety net so that conflicts never go
        // silent when a caller forgets.
        const installedDesc =
          event.installedVersion.kind === 'pinned'
            ? `installed version ${event.installedVersion.value}`
            : `default branch (no version pinned)`;
        console.warn(
          `Diamond version conflict for module '${event.name}': ` +
            `${installedDesc} ` +
            `does not satisfy range '${event.rejectingRange}' ` +
            `(required by ${event.rejectingParent?.name ?? '<unknown parent>'})`,
        );
      });

    while (queue.length > 0) {
      const decl = queue.shift()!;
      const existing = decl.name !== '' ? resolved.get(decl.name) : undefined;

      if (existing) {
        // Name was resolved earlier. Verify that this later declaration
        // agrees on source, then either dedup silently or surface a
        // diamond conflict.
        this.assertSourceAgreement(existing, decl);

        if (
          decl.versionRange &&
          existing.version &&
          !this.versionSatisfies(existing.version, decl.versionRange)
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

      // First encounter: decide a version (possibly via override), fetch
      // the module so we can read its transitive deps, and record it.
      const remoteUrl = buildRemoteUrl(decl.source, options.credentials);
      const override =
        decl.name !== '' ? options.overrides?.get(decl.name) : undefined;

      let version: Version | undefined;
      let ref: string | undefined;

      if (override !== undefined) {
        version = toVersion(override);
        ref = versionToTag(version);
      } else if (isFileLocation(decl.source.location)) {
        version = undefined;
        ref = undefined;
      } else if (decl.versionRange && isGitLocation(decl.source.location)) {
        const available = await this.source.listRemoteVersions(
          decl.source.location,
          remoteUrl,
        );
        const picked = pickVersion(available, decl.versionRange);
        if (!picked) {
          throw new Error(
            `No version satisfies range '${decl.versionRange}' for module ` +
              `'${decl.name || decl.source.location}'`,
          );
        }
        version = picked;
        ref = versionToTag(version);
      } else {
        // Git source without a range, or a non-git/non-file location:
        // fall through to the default branch.
        version = undefined;
        ref = undefined;
      }

      // Fetch so we can read the module's own declared deps. The name
      // hint falls back to a deterministic placeholder for the empty
      // fresh-root case; once we have the config we rekey the resolved
      // entry on the true `cardKeyPrefix`.
      const nameHint = decl.name !== '' ? decl.name : fallbackNameHint(decl);
      const path = await this.source.fetch(
        { location: decl.source.location, remoteUrl, ref },
        options.tempDir,
        nameHint,
      );
      const childConfig = await readConfig(path);
      const resolvedName =
        decl.name !== '' ? decl.name : childConfig.cardKeyPrefix;

      if (!resolvedName) {
        throw new Error(
          `Module at '${decl.source.location}' has no name and its ` +
            `cardsConfig.json is missing cardKeyPrefix`,
        );
      }

      // A late check for the empty-name case — another root may have
      // resolved to the same prefix before this one.
      const rekeyed = resolved.get(resolvedName);
      if (rekeyed) {
        this.assertSourceAgreement(rekeyed, decl);
        if (
          decl.versionRange &&
          rekeyed.version &&
          !this.versionSatisfies(rekeyed.version, decl.versionRange)
        ) {
          onConflict({
            project: decl.project,
            name: resolvedName,
            installedVersion: { kind: 'pinned', value: rekeyed.version },
            rejectingRange: decl.versionRange,
            rejectingParent: decl.parent,
          });
        }
        continue;
      }

      const resolvedEntry: ResolvedModule = {
        declaration: { ...decl, name: resolvedName },
        ref,
        remoteUrl,
        version,
      };
      resolved.set(resolvedName, resolvedEntry);

      // Enqueue transitive declarations read from the fetched module's
      // own cardsConfig.json. Each gets the owning installation as its
      // `parent`, so the resolver can surface diamond conflicts with
      // useful attribution.
      const childDecls = childConfig.modules ?? [];
      for (const child of childDecls) {
        queue.push(toChildDeclaration(decl.project, resolvedName, child));
      }
    }

    return Array.from(resolved.values());
  }

  /**
   * Enforce the spec's `DeclarationAndInstallationAgreeOnSource`
   * invariant at resolve time: if any two declarations for the same
   * name disagree on `location` or `private`, the walk is a hard error.
   */
  private assertSourceAgreement(
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

  private versionSatisfies(version: Version, range: VersionRange): boolean {
    return satisfies(version, range);
  }
}

/**
 * Build a transitive declaration from a child `ModuleSetting`, attaching
 * the owning installation as its `parent`. Mirrors the relation
 * `ModuleInstallation.declared_deps` from the spec.
 */
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

/**
 * Produce a stable placeholder name for a declaration that arrived
 * without one. Preferred for fresh-root imports where the resolver is
 * the first component to learn the module's real prefix.
 */
function fallbackNameHint(decl: ModuleDeclaration): string {
  // Use the tail of the location plus a random suffix so that
  // concurrent imports of the same repo do not collide on disk.
  const last = decl.source.location.lastIndexOf('/');
  const tail =
    last >= 0
      ? decl.source.location.slice(last + 1).replace(/\.git$/i, '')
      : decl.source.location;
  const safe = tail.replace(/[^A-Za-z0-9._-]/g, '_') || 'module';
  return `${safe}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Construct the default {@link Resolver} — a BFS walk backed by a
 * {@link SourceLayer} for fetch / list-tags.
 */
export function createResolver(source: SourceLayer): Resolver {
  return new Resolver(source);
}
