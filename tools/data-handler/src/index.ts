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
import { EditSessionCmd } from './commands/edit-session.js';
import { Validate } from './commands/validate.js';
import {
  GitManager,
  type GitStatus,
  type GitUserConfig,
  type WorktreeInfo,
  type MergeResult,
} from './containers/project/git-manager.js';
import { EditSessionManager } from './containers/edit-session-manager.js';
import type {
  EditSession,
  EditSessionCreate,
  EditSessionPublishResult,
  EditSessionSaveResult,
  EditSessionStatus,
} from './types/edit-session.js';
export * from './interfaces/project-interfaces.js';
export * from './interfaces/macros.js';
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
import { evaluateMacros } from './macros/index.js';
import {
  isResourceFolderType,
  resourceName,
  resourceNameToString,
} from './utils/resource-utils.js';
import { moduleNameFromCardKey } from './utils/card-utils.js';

export {
  Cmd,
  CmdKey,
  CmdValue,
  CommandManager,
  Commands,
  EditSessionCmd,
  EditSessionManager,
  ExportFormats,
  GitManager,
  isResourceFolderType,
  moduleNameFromCardKey,
  requestStatus,
  resourceName,
  resourceNameToString,
  UpdateOperations,
  Validate,
  evaluateMacros,
};

export type { GitStatus, GitUserConfig, MergeResult, WorktreeInfo };

export type {
  EditSession,
  EditSessionCreate,
  EditSessionPublishResult,
  EditSessionSaveResult,
  EditSessionStatus,
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
  RankCommandOptions,
  RemoveCommandOptions,
  RenameCommandOptions,
  ReportCommandOptions,
  SessionCommandOptions,
  ShowCommandOptions,
  StartCommandOptions,
  TransitionCommandOptions,
  UpdateCommandOptions,
  UpdateModulesCommandOptions,
  ValidateCommandOptions,
} from './interfaces/command-options.js';
