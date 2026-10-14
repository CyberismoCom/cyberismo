/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Workspace } from './workspace/workspace.js';
import { ExportFormats } from './export/export.js';
import { Validate } from './commands/validate.js';
export { SCHEMA_VERSION } from '@cyberismo/migrations';
export { createProject } from './directory/create-project.js';
export { localFolder, openProjectAt } from './directory/local-folder.js';
export { renameProject } from './directory/rename-project.js';
export { migrateProject } from './directory/migrate-project.js';
export type { ProjectDirectory } from './directory/project-directory.js';
import { macroErrorText } from './macros/render.js';
import { validBumps } from './versions/version.js';
import {
  isResourceFolderType,
  resourceName,
  resourceNameToString,
} from './utils/resource-utils.js';
import { moduleNameFromCardKey } from './utils/card-utils.js';
import { scanForProjects } from './project-scanner.js';

export {
  Workspace,
  ExportFormats,
  isResourceFolderType,
  moduleNameFromCardKey,
  resourceName,
  resourceNameToString,
  scanForProjects,
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
} from './exceptions/index.js';
export { AsciidoctorPdfError } from './export/export.js';
export {
  ModuleReplayFailedError,
  ModuleValidationFailedError,
} from './mutations/replay/replay.js';
export { errorFunction } from './utils/error-utils.js';
export type { WorkspaceOptions } from './workspace/workspace.js';
export { SYSTEM_ACTOR, type CommitIdentity } from './utils/tx-record.js';
export { createGit } from './infra/git-config.js';
