// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Workspace } from './api/workspace.js';
import { ExportFormats } from './api/export.js';
import { Validate } from './domain/validation/validate.js';
export { SCHEMA_VERSION } from '@cyberismo/migrations';
export { createProject } from './api/directory/create-project.js';
export { localFolder, openProjectAt } from './api/directory/local-folder.js';
export { renameProject } from './api/directory/rename-project.js';
export { migrateProject } from './api/directory/migrate-project.js';
export type { ProjectDirectory } from './api/directory/project-directory.js';
import { macroErrorText } from './api/render.js';
import { notExportedWarning } from './domain/macros/index.js';
import { validBumps } from './api/versions.js';
import {
  isResourceFolderType,
  resourceName,
  resourceNameToString,
} from './shared/utils/resource-utils.js';
import {
  exportedTree,
  moduleNameFromCardKey,
  omitHiddenCards,
} from './shared/utils/card-utils.js';

export {
  Workspace,
  ExportFormats,
  exportedTree,
  isResourceFolderType,
  moduleNameFromCardKey,
  omitHiddenCards,
  resourceName,
  resourceNameToString,
  Validate,
  macroErrorText,
  notExportedWarning,
  validBumps,
};

export {
  AttachmentNotFoundError,
  CardNotFoundError,
  ContainerMismatchError,
  CycleError,
  DHValidationError,
  DomainError,
  DuplicateCardKeyError,
  MacroError,
  MissingActorError,
  ModuleRequestError,
  PermissionDeniedError,
  ProjectExistsError,
  ProjectNotFoundError,
  ReadOnlyContainerError,
  ResourceNotFoundError,
  SchemaNotFound,
  WorkspaceDisposedError,
} from './shared/exceptions/index.js';
export { AsciidoctorPdfError } from './api/export.js';
export {
  ModuleReplayFailedError,
  ModuleValidationFailedError,
} from './domain/resources/changes/replay/replay.js';
export { errorFunction } from './shared/utils/error-utils.js';
export type { WorkspaceOptions } from './api/workspace.js';
export type { GraphRequest } from './api/queries.js';
export {
  queryOptions,
  type QueryOptions,
} from './state/engine/query-options.js';
export { SYSTEM_ACTOR, type CommitIdentity } from './infra/tx/tx-record.js';
export { createGit } from './infra/git/git-config.js';
export {
  LogicError,
  LogicInternalError,
  LogicInvalidError,
  LogicNonTotalError,
  LogicUnavailableError,
  type CommitOptions,
  type Diagnostic,
  type LogicBackend,
  type LogicBackendFactory,
  type LogicBackendOwner,
  type LogicTransaction,
  type Program,
  type QueryResult as LogicQueryResult,
} from './infra/logic/logic-backend.js';
export { clingoLogicBackend } from './infra/logic/clingo-backend.js';
