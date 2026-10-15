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

import type { Source } from '@cyberismo/model';

import type {
  Version,
  VersionRange,
} from '../../../../shared/utils/version.js';

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** Lightweight reference to a {@link ModuleInstallation} (avoids circular types). */
export interface InstallationRef {
  project: string;
  name: string;
}

/**
 * Persisted record in the project's `cardsConfig.json`: "this project wants
 * this module at this range". Top-level declarations have `parent` absent;
 * transitive declarations carry the owning installation as `parent`.
 */
export interface ModuleDeclaration {
  project: string;
  name: string;
  source: Source;
  versionRange?: VersionRange;
  parent?: InstallationRef;
}

/**
 * Module files present under `.cards/modules/<name>/`. At most one
 * installation per (project, name) — module prefixes are a global namespace.
 */
export interface ModuleInstallation {
  project: string;
  name: string;
  source: Source;
  version?: Version;
  path: string;
  /**
   * Names of modules this installation declares as transitive dependencies
   * in its own `cardsConfig.json`. Empty when the file has no `modules`
   * array or is unreadable.
   */
  declaredDependencies: string[];
}

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
