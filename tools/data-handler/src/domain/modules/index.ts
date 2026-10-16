// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
  InstallationRef,
  ModuleDeclaration,
  ModuleInstallation,
  ResolvedModule,
} from '../resources/changes/replay/module-types.js';
export type { Version, VersionRange } from '../../shared/utils/version.js';
export type { FetchTarget, SourceLayer } from '../../infra/modules/source.js';
export type {
  Change,
  ConflictDemand,
  ResolveConflict,
  ResolveResult,
  UpdateRequest,
} from './resolve/types.js';
export type { ApplyOptions } from './applier.js';
export type { CleanOrphansOptions } from './orphans.js';

// Version and location primitives.
export {
  toDeclaredRange,
  toVersion,
  toVersionRange,
} from '../../shared/utils/version.js';
export {
  FILE_PROTOCOL,
  isFileLocation,
  isGitLocation,
  stripFileProtocol,
} from '../../shared/utils/location.js';
export {
  pickVersion,
  stripTagPrefix,
  validateVersionAgainstConstraints,
  versionToTag,
} from '../../shared/utils/version.js';
export { buildRemoteUrl } from './remote-url.js';

// Reading what a project declares and what it has installed.
export {
  declaredModules,
  installedModules,
  installedModulesWithSources,
  moduleInfos,
  projectModules,
} from './inventory.js';

// Fetching, resolving and applying.
export { createSourceLayer } from '../../infra/modules/source.js';
export { resolve, resolveForApply, stageResolution } from './resolve/solver.js';
export {
  checkUpdate,
  requireDeclared,
  resolveUpdate,
  toUpdatePlan,
} from './update-plan.js';
export { conflictReason } from './resolve/format.js';
export { ensureStagedSchemas } from './staged-migration.js';
export { applyModules } from './applier.js';
export { cleanOrphans } from './orphans.js';

// Used by api/.
export { moduleFingerprint } from './fingerprint.js';
export type { CheckedTarget } from './update-plan.js';
