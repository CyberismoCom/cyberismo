// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

/** The door of this domain: api/ imports it only through here. */

export { classify } from './changes/dispatcher.js';
export type { ChangeClassification } from './changes/registry.js';
export { entryToMutationInput } from './changes/replay/convert.js';
export type { ResolvedModule } from './changes/replay/module-types.js';
export {
  ModuleReplayFailedError,
  ModuleValidationFailedError,
  executeModuleReplays,
  filterStepsToApplied,
  planModuleReplays,
} from './changes/replay/replay.js';
export type { ReplayStep } from './changes/replay/replay.js';
export {
  ResourceMutations,
  createSubject,
} from './changes/resource-mutations.js';
