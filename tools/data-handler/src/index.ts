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
  CommandManager,
  ExportFormats,
} from './command-handler.js';
import { Validate } from './commands/validate.js';
export * from './interfaces/project-interfaces.js';
export * from './interfaces/macros.js';
export type { ProjectProvider } from './interfaces/project-provider.js';
export {
  COMMIT_TRAILERS,
  runWithCommitContext,
} from './utils/commit-context.js';
export type {
  CommitActor,
  CommitAuthor,
  CommitContext,
} from './utils/commit-context.js';
export type { CardsChanged } from './containers/project.js';
export {
  ChangeSetBehindError,
  ChangeSetManager,
} from './changesets/change-set-manager.js';
export type {
  ChangeSetChanges,
  ChangeSetConflict,
  ChangeSetInfo,
  ChangeSetManagerOptions,
  ConflictResolution,
  ReviewedCardChange,
} from './changesets/change-set-manager.js';
export type {
  CardChange,
  CardCommit,
  ChangeList,
  FieldChange,
} from './changesets/change-list.js';
import { requestStatus } from './interfaces/request-status-interfaces.js';
import { UpdateOperations } from './resources/resource-object.js';
export type {
  Operation,
  OperationFor,
  AddOperation,
  ChangeOperation,
  RankOperation,
  RemoveOperation,
} from './resources/resource-object.js';
export type { MutationInput } from './mutations/types.js';
export type { HubFetchFailure } from './commands/fetch.js';
export type {
  CleanFinding,
  CleanReason,
  CleanResult,
} from './commands/clean.js';
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
  CommandManager,
  Commands,
  Create,
  ExportFormats,
  isResourceFolderType,
  moduleNameFromCardKey,
  requestStatus,
  resourceName,
  resourceNameToString,
  scanForProjects,
  UpdateOperations,
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
