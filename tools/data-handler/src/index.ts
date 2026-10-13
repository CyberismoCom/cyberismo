/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import {
  Cmd,
  CmdKey,
  CmdValue,
  Commands,
  Workspace,
  ExportFormats,
} from './command-handler.js';
import { Validate } from './commands/validate.js';
export { SCHEMA_VERSION } from '@cyberismo/migrations';
export * from './interfaces/macros.js';
export type { ProjectProvider } from './interfaces/project-provider.js';
import { requestStatus } from './interfaces/request-status-interfaces.js';
export type { attachmentPayload } from './interfaces/request-status-interfaces.js';
export type { HubFetchFailure } from './commands/fetch.js';
import { evaluateMacros } from './macros/index.js';
import { validBumps } from './commands/version.js';
import {
  isResourceFolderType,
  resourceName,
  resourceNameToString,
} from './utils/resource-utils.js';
import { moduleNameFromCardKey } from './utils/card-utils.js';
import { scanForProjects } from './project-scanner.js';
import { Create } from './commands/create.js';

export {
  Cmd,
  CmdKey,
  CmdValue,
  Workspace,
  Commands,
  Create,
  ExportFormats,
  isResourceFolderType,
  moduleNameFromCardKey,
  requestStatus,
  resourceName,
  resourceNameToString,
  scanForProjects,
  Validate,
  evaluateMacros,
  validBumps,
};

// Export command-specific option interfaces
export type {
  CommandOptions,
  AllCommandOptions,
  AddCommandOptions,
  CalcCommandOptions,
  CreateCommandOptions,
  EditCommandOptions,
  ExportCommandOptions,
  FetchCommandOptions,
  ImportCommandOptions,
  MoveCommandOptions,
  PublishCommandOptions,
  RankCommandOptions,
  RemoveCommandOptions,
  RenameCommandOptions,
  ReportCommandOptions,
  ShowCommandOptions,
  StartCommandOptions,
  TransitionCommandOptions,
  UpdateCommandOptions,
  UpdateModulesCommandOptions,
  ValidateCommandOptions,
  VersionCommandOptions,
} from './interfaces/command-options.js';

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
  ReadOnlyContainerError,
  ResourceNotFoundError,
  SchemaNotFound,
  WorkspaceDisposedError,
} from './exceptions/index.js';
export type { Checkout } from './containers/project.js';
export type { WorkspaceOpener } from './command-handler.js';
export { openCheckout, type WorkspaceOptions } from './workspace/workspace.js';
export {
  SYSTEM_ACTOR,
  type CommitIdentity,
  type WriteFrame,
} from './utils/tx-record.js';
