/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

import type { RemovableResourceTypes } from '@cyberismo/model';
import type {
  AllCommandOptions,
  CalcCommandOptions,
  StartCommandOptions,
} from './interfaces/command-options.js';

import type { requestStatus } from './interfaces/request-status-interfaces.js';

import { Validate } from './commands/validate.js';
import { Workspace, type WorkspaceOptions } from './workspace/workspace.js';
import { Checkout } from './containers/project.js';
import { SYSTEM_ACTOR } from './utils/tx-record.js';

import {
  isValidFolderName,
  pathExists,
  resolveTilde,
} from './utils/file-utils.js';
import { ModuleRequestError } from './exceptions/index.js';
import { errorFunction } from './utils/error-utils.js';
import { resourceName } from './utils/resource-utils.js';

import { type Level } from 'pino';
import { type Context } from '@cyberismo/model';
import { type BumpType } from './versions/version.js';

// Commands that this class supports.
export const Cmd = {
  add: 'add',
  calc: 'calc',
  clean: 'clean',
  create: 'create',
  edit: 'edit',
  export: 'export',
  fetch: 'fetch',
  import: 'import',
  migrate: 'migrate',
  move: 'move',
  publish: 'publish',
  rank: 'rank',
  version: 'version',
  remove: 'remove',
  rename: 'rename',
  report: 'report',
  show: 'show',
  transition: 'transition',
  update: 'update',
  updateModules: 'update-modules',
  validate: 'validate',
};

export type CmdKey = keyof typeof Cmd;
export type CmdValue = (typeof Cmd)[CmdKey];

// To what format the content can be exported to.
export enum ExportFormats {
  adoc = 'adoc',
  site = 'site',
  pdf = 'pdf',
}

export { Workspace } from './workspace/workspace.js';

/** Gives the dispatcher the handle to run a command on. */
export type WorkspaceOpener = (
  options: WorkspaceOptions & { projectPath: string },
) => Promise<Workspace>;

// One checkout at a time, replaced when the path changes; the system acts.
let systemCheckout: Checkout | undefined;
const openAsSystem: WorkspaceOpener = async ({ projectPath, ...options }) => {
  if (systemCheckout?.basePath !== projectPath) {
    systemCheckout?.dispose();
    systemCheckout = undefined;
    systemCheckout = await Checkout.open(projectPath, options);
  }
  return Workspace.over(systemCheckout, SYSTEM_ACTOR);
};

/**
 * Class that handles all CLI commands.
 */
export class Commands {
  private ws?: Workspace;
  private projectPath: string;
  private validateCmd: Validate;
  private level?: Level;

  /**
   * @param open Gives the handle for a project path; without it, the system
   *   acts on one checkout at a time.
   */
  constructor(private readonly open: WorkspaceOpener = openAsSystem) {
    this.projectPath = '';
    this.validateCmd = Validate.getInstance();
  }

  /**
   * Executes one command for CLI.
   *
   * @note internal functions that this method calls, should return a Promise and throw on error.
   * No internal trap harnesses; all exceptions from internal methods should be caught by this methods trap handler.
   * If internal method has payload, the method should return requestStatus that can be directly returned from calling that function.
   *
   * @param command command to execute
   * @param args arguments for the command
   * @param options options for the command
   * @returns request status; 200 if success; 400 in handled error; 500 in unknown error
   */
  public async command(
    command: CmdValue,
    args: string[],
    options: AllCommandOptions,
  ): Promise<requestStatus> {
    // Set project path and validate it.
    try {
      await this.doSetProject(options);
    } catch (error) {
      return { statusCode: 400, message: errorFunction(error) };
    }
    return await this.doHandleCommand(command, args, options);
  }

  // Returns command 'target'.
  // If name is resource name -> returns from <prefix/type/identifier> 'type' in singular form.
  // If not, returns the input parameter.
  private commandType<Type>(type: string): Type {
    const resource = resourceName(type);
    return (resource.type.substring(0, resource.type.length - 1) ||
      type) as Type;
  }

  // If 'type' is resource name, replaces original 'target' with 'type'
  private commandTarget(type: string, target: string) {
    const resource = resourceName(type);
    return resource.type ? type : target;
  }

  // Resolves and validates the project path without loading the project.
  private async resolveProjectPath(options: AllCommandOptions) {
    const path = options.projectPath || '';
    this.projectPath = resolveTilde(await this.setProjectPath(path));
    if (!isValidFolderName(this.projectPath)) {
      const errorMessage =
        path === '' || path === undefined
          ? `No 'cardRoot' in the current folder`
          : `Input validation error: folder name '${path}' is invalid`;
      throw new Error(errorMessage);
    }

    if (!pathExists(this.projectPath)) {
      throw new Error(`Input validation error: cannot find project '${path}'`);
    }
  }

  // Handles initializing the project so that it can be used in the class.
  private async doSetProject(options: AllCommandOptions) {
    await this.resolveProjectPath(options);

    this.ws = await this.open({
      projectPath: this.projectPath,
      logLevel: options.logLevel,
      watchResourceChanges: (options as StartCommandOptions)
        .watchResourceChanges,
      autocommit: options.autocommit,
      autopush: options.autopush,
    });
    if (!this.ws) {
      throw new Error('Cannot get instance of CommandManager');
    }
  }

  // Handles actual command. Sets returns values correctly.
  private async doHandleCommand(
    command: CmdValue,
    args: string[],
    options: AllCommandOptions,
  ) {
    try {
      if (command === Cmd.calc) {
        const [command, ...rest] = args;
        if (command === 'run') {
          const [cardKey] = rest;
          if (!cardKey) {
            return { statusCode: 400, message: 'File path is missing' };
          }
          return this.runLogicProgram(
            cardKey,
            (options as CalcCommandOptions).context || 'commandLine',
          );
        }
      } else if (command === Cmd.create) {
        const [type] = args;
        throw new Error(`Unknown type to create: '${this.commandType(type)}'`);
      } else if (command === Cmd.publish) {
        return this.publish(args);
      } else if (command === Cmd.version) {
        return this.version(args);
      } else if (command === Cmd.remove) {
        const [type, target] = args;
        const removed = this.commandType<RemovableResourceTypes>(type);
        await this.remove(removed, this.commandTarget(type, target));
      } else if (command === Cmd.clean) {
        return this.clean(args);
      } else if (command === Cmd.validate) {
        return this.validate();
      } else {
        return { statusCode: 500, message: 'Unknown command' };
      }
    } catch (e) {
      const detail = e instanceof ModuleRequestError ? e.detail : undefined;
      return {
        statusCode: 400,
        message: errorFunction(e) + (detail ? `\n${detail}` : ''),
      };
    }
    return { statusCode: 200 };
  }

  /**
   * Returns project path, if running operation within project folder.
   * Implementation will automatically look for valid project path starting from 'path' and moving upwards in the
   * path until 'root' is reached.
   * @param path Initial path from where the project path search is started.
   * Returns valid project path (contains both .cards and cardRoot subfolders).
   */
  public async setProjectPath(path?: string): Promise<string> {
    // Check that path is a project path; ie. contains both .cards and cardRoot subfolders.
    function isProjectPath(path: string) {
      const cardsPath = resolve(join(path, '.cards'));
      const cardRootPath = resolve(join(path, 'cardRoot'));
      return pathExists(cardsPath) && pathExists(cardRootPath);
    }

    if (!path) {
      path = await Checkout.findProjectRoot(process.cwd());
      if (path === '') {
        console.error(
          'No path defined with "-p" flag and could not find project. Sorry.',
        );
        process.exit(1);
      }
    }
    path = resolveTilde(path);
    return isProjectPath(path) ? path : '';
  }

  // Bumps project version in cardsConfig.json.
  private async version(args: string[]): Promise<requestStatus> {
    if (!this.ws) {
      return { statusCode: 500, message: 'Commands not initialized' };
    }

    const [bumpType] = args;
    const result = await this.ws.versions.bump(bumpType as BumpType);

    const previousInfo = result.previousVersion
      ? ` (was v${result.previousVersion})`
      : '';
    return {
      statusCode: 200,
      message: `Bumped to v${result.newVersion}${previousInfo}`,
    };
  }

  // Removes field values that are not used by card types.
  private async clean(args: string[]): Promise<requestStatus> {
    if (!this.ws) {
      return { statusCode: 500, message: 'Commands not initialized' };
    }

    const [dryRunFlag] = args;
    const dryRun = dryRunFlag === 'true';

    const result = await this.ws.clean.run(dryRun);

    const skipped = result.skippedCards.length
      ? `\nSkipped ${result.skippedCards.length} card(s) with unresolvable card types: ${result.skippedCards.join(', ')}`
      : '';
    if (result.findings.length === 0) {
      return { statusCode: 200, message: `Nothing to clean${skipped}` };
    }

    const failed = result.failedCards.length
      ? `\nCould not update ${result.failedCards.length} card(s); their values were not removed: ${result.failedCards.join(', ')}`
      : '';
    const lines = result.findings.map(
      (finding) => `  ${finding.cardKey}: ${finding.field} (${finding.reason})`,
    );

    // The headline counts what actually changed, so a partial failure cannot
    // report a card as cleaned.
    const failedCards = new Set(result.failedCards);
    const removed = result.findings.filter(
      (finding) => !failedCards.has(finding.cardKey),
    );
    const removedCards = new Set(removed.map((finding) => finding.cardKey))
      .size;
    const verb = dryRun ? 'Would remove' : 'Removed';
    return {
      statusCode: 200,
      message: `${lines.join('\n')}\n${verb} ${removed.length} field value(s) from ${removedCards} card(s)${skipped}${failed}`,
    };
  }

  // Publishes the current version by creating a git tag and pushing.
  private async publish(args: string[]): Promise<requestStatus> {
    if (!this.ws) {
      return { statusCode: 500, message: 'Commands not initialized' };
    }

    const [dryRunFlag, remote] = args;
    const dryRun = dryRunFlag === 'true';

    const result = await this.ws.versions.publish(dryRun, remote || undefined);

    if (result.dryRun) {
      return {
        statusCode: 200,
        message: `Would publish v${result.version} (create tag and push to remote '${result.remote}')`,
      };
    }

    return {
      statusCode: 200,
      message: `Published v${result.version}`,
    };
  }

  // Removes a resource, hub or module.
  private async remove(
    type: RemovableResourceTypes,
    targetName: string,
  ): Promise<void> {
    if (type === 'module') {
      return await this.ws?.modules.remove(targetName);
    }
    return await this.ws?.removeCmd.remove(type, targetName);
  }

  // Runs a given logic program along with the query-language
  private async runLogicProgram(
    filePath: string,
    context: Context,
  ): Promise<requestStatus> {
    try {
      const res = await this.ws?.queries.runLogicProgram(
        readFileSync(filePath, 'utf-8'),
        context,
      );
      return {
        statusCode: 200,
        payload: res,
      };
    } catch (e) {
      return { statusCode: 500, message: errorFunction(e) };
    }
  }

  // Validates that a given path conforms to schema. Validates both file/folder structure and file content.
  private async validate(): Promise<requestStatus> {
    if (!this.ws) {
      return { statusCode: 500, message: 'Commands not initialized' };
    }
    const result = await this.validateCmd.validate(
      this.projectPath,
      () => this.ws!.checkout,
    );
    return {
      statusCode: 200,
      message: result.length ? result : 'Project structure validated',
    };
  }
}
