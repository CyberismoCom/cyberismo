/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { type Level } from 'pino';
import { type Context } from './project-interfaces.js';

// Base options shared across multiple commands
export interface BaseCommandOptions {
  projectPath?: string;
  logLevel?: Level;
}

// Options for commands that need context
export interface ContextualCommandOptions extends BaseCommandOptions {
  context?: Context;
}

// Options for 'add' command
export interface AddCommandOptions extends BaseCommandOptions {
  repeat?: number;
}

// Options for 'calc' command
export type CalcCommandOptions = ContextualCommandOptions;

// Options for 'create' command
export interface CreateCommandOptions extends BaseCommandOptions {
  skipModuleImport?: boolean;
}

// Options for 'edit' command
export type EditCommandOptions = BaseCommandOptions;

// Options for the 'export' command
export interface ExportCommandOptions extends BaseCommandOptions {
  recursive?: boolean;
  title?: string;
  name?: string;
  version?: string;
  date?: string;
  revremark?: string;
}

// Options for 'fetch' command
export type FetchCommandOptions = BaseCommandOptions;

// Options for 'import' command
export type ImportCommandOptions = BaseCommandOptions;

// Options for 'move' command
export type MoveCommandOptions = BaseCommandOptions;

// Options for 'rank' command
export type RankCommandOptions = BaseCommandOptions;

// Options for 'remove' command
export type RemoveCommandOptions = BaseCommandOptions;

// Options for 'rename' command
export type RenameCommandOptions = BaseCommandOptions;

// Options for 'report' command
export type ReportCommandOptions = ContextualCommandOptions;

// Options for 'show' command
export interface ShowCommandOptions extends BaseCommandOptions {
  details?: boolean;
  showAll?: boolean;
  showUse?: boolean;
}

// Options for 'start' command
export interface StartCommandOptions extends BaseCommandOptions {
  forceStart?: boolean;
  watchResourceChanges?: boolean;
}

// Options for 'transition' command
export type TransitionCommandOptions = BaseCommandOptions;

// Options for 'update' command
export interface UpdateCommandOptions extends BaseCommandOptions {
  mappingFile?: string;
}

// Options for 'updateModules' command
export type UpdateModulesCommandOptions = BaseCommandOptions;

// Options for 'validate' command
export type ValidateCommandOptions = BaseCommandOptions;

// Comprehensive interface that contains all possible options for the main command method
// This allows the command handler to access any option that might be passed
export interface AllCommandOptions extends
  AddCommandOptions,
  ContextualCommandOptions,
  CreateCommandOptions,
  ExportCommandOptions,
  ShowCommandOptions,
  StartCommandOptions,
  UpdateCommandOptions {}
