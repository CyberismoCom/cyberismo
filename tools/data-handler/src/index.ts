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
import { validBumps } from './api/versions.js';
import {
  isResourceFolderType,
  resourceName,
  resourceNameToString,
} from './shared/utils/resource-utils.js';
import { moduleNameFromCardKey } from './shared/utils/card-utils.js';

export {
  Workspace,
  ExportFormats,
  isResourceFolderType,
  moduleNameFromCardKey,
  resourceName,
  resourceNameToString,
  Validate,
  macroErrorText,
  validBumps,
};

export {
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
export { SYSTEM_ACTOR, type CommitIdentity } from './infra/tx/tx-record.js';
export { createGit } from './infra/git/git-config.js';
