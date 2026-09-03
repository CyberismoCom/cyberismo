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

/**
 * Public API of the modules subsystem.
 *
 * Exports are named rather than re-exported wholesale: everything reachable
 * from here is something callers outside `modules/` are meant to use, and
 * anything absent is an implementation detail. Widening the surface should be
 * a deliberate edit to this file.
 */

// Vocabulary: the types that appear in the signatures below.
export type {
  CheckStatus,
  InstallationRef,
  ModuleDeclaration,
  ModuleInstallation,
  Source,
  Version,
  VersionRange,
} from './types.js';
export type { FetchTarget, SourceLayer } from './source.js';
export type {
  Change,
  ConflictDemand,
  ResolveConflict,
  ResolvedModule,
  ResolveResult,
  UpdateRequest,
} from './resolve/types.js';
export type { ApplyOptions } from './applier.js';
export type { CleanOrphansOptions } from './orphans.js';

// Version and location primitives.
export { toVersion, toVersionRange } from './types.js';
export {
  FILE_PROTOCOL,
  isFileLocation,
  isGitLocation,
  stripFileProtocol,
} from './location.js';
export {
  pickVersion,
  stripTagPrefix,
  validateVersionAgainstConstraints,
  versionToTag,
} from './version.js';
export { buildRemoteUrl } from './remote-url.js';
export { ModuleNotDeclaredError, ModuleVersionError } from './errors.js';
export { validateExplicitTarget } from './explicit-target.js';

// Reading what a project declares and what it has installed.
export {
  declaredModules,
  installedModules,
  installedModulesWithSources,
  requireDeclaredRoot,
} from './inventory.js';
export type { ModuleAction } from './inventory.js';

// Fetching, resolving and applying.
export { createSourceLayer } from './source.js';
export { resolve, resolveForApply } from './resolve/solver.js';
export { conflictReason } from './resolve/format.js';
export { ensureStagedSchemas } from './staged-migration.js';
export { applyModules } from './applier.js';
export { cleanOrphans } from './orphans.js';
