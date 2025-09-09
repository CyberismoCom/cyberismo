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
  Commands,
  CommandManager,
  ExportFormats,
} from './command-handler.js';
import { Validate } from './commands/validate.js';
export * from './interfaces/project-interfaces.js';
import { requestStatus } from './interfaces/request-status-interfaces.js';
import { UpdateOperations } from './resources/resource-object.js';
import { evaluateMacros } from './macros/index.js';
import {
  isResourceFolderType,
  resourceName,
  resourceNameToString,
} from './utils/resource-utils.js';
import { moduleNameFromCardKey } from './utils/card-utils.js';

export {
  Cmd,
  CommandManager,
  Commands,
  ExportFormats,
  isResourceFolderType,
  moduleNameFromCardKey,
  requestStatus,
  resourceName,
  resourceNameToString,
  UpdateOperations,
  Validate,
  evaluateMacros,
};

// Export command-specific option interfaces
export type {
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
  ShowCommandOptions,
  StartCommandOptions,
  TransitionCommandOptions,
  UpdateCommandOptions,
  UpdateModulesCommandOptions,
  ValidateCommandOptions,
} from './interfaces/command-options.js';
