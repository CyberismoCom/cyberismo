// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { WorkspaceOptions } from '@cyberismo/data-handler';
import type { Context } from '@cyberismo/model';

// Base options shared across multiple commands
export interface BaseCommandOptions {
  projectPath?: string;
  logLevel?: WorkspaceOptions['logLevel'];
  autocommit?: boolean;
  autopush?: boolean;
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
  defaultProject?: string;
}

// Options for 'fetch' command
export type FetchCommandOptions = BaseCommandOptions;

// Options for 'import' command
export type ImportCommandOptions = BaseCommandOptions;

// Options for 'migrate' command
export type MigrateCommandOptions = BaseCommandOptions;

// Options for 'move' command
export type MoveCommandOptions = BaseCommandOptions;

// Options for 'rank' command
export type RankCommandOptions = BaseCommandOptions;

// Options for 'remove' command
export type RemoveCommandOptions = BaseCommandOptions;

// Options for 'rename' command
export interface RenameCommandOptions extends BaseCommandOptions {
  force?: boolean;
}

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
  watchResourceChanges?: boolean;
}

// Options for 'publish' command
export interface PublishCommandOptions extends BaseCommandOptions {
  dryRun?: boolean;
  remote?: string;
}

// Options for 'version' command
export type VersionCommandOptions = BaseCommandOptions;

// Options for 'transition' command
export type TransitionCommandOptions = BaseCommandOptions;

// Options for 'update' command
export interface UpdateCommandOptions extends BaseCommandOptions {
  mappingFile?: string;
}

// Options for 'clean' command
export interface CleanCommandOptions extends BaseCommandOptions {
  dryRun?: boolean;
}

// Options for 'updateModules' command
export interface UpdateModulesCommandOptions extends BaseCommandOptions {
  dryRun?: boolean;
}

// Options for 'validate' command
export type ValidateCommandOptions = BaseCommandOptions;

// All possible command options
export type AllCommandOptions =
  | AddCommandOptions
  | CalcCommandOptions
  | CleanCommandOptions
  | CreateCommandOptions
  | EditCommandOptions
  | ExportCommandOptions
  | FetchCommandOptions
  | ImportCommandOptions
  | MigrateCommandOptions
  | MoveCommandOptions
  | PublishCommandOptions
  | RankCommandOptions
  | RemoveCommandOptions
  | RenameCommandOptions
  | ReportCommandOptions
  | ShowCommandOptions
  | StartCommandOptions
  | TransitionCommandOptions
  | UpdateCommandOptions
  | UpdateModulesCommandOptions
  | ValidateCommandOptions
  | VersionCommandOptions;
