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

import type {
  Credentials,
  HubSetting,
  ModuleContent,
  ModuleInfo,
  ModuleInstallResult,
  ModuleSettingFromHub,
  ModuleUpdateResult,
  ReplayedModule,
  RemovableResourceTypes,
  ResourceTypes,
} from '@cyberismo/model';
import type {
  AllCommandOptions,
  CalcCommandOptions,
  ShowCommandOptions,
  RenameCommandOptions,
  StartCommandOptions,
  UpdateModulesCommandOptions,
} from './interfaces/command-options.js';

import type { requestStatus } from './interfaces/request-status-interfaces.js';

import { Create } from './commands/create.js';
import { migrate as migrateProject } from './commands/migrate.js';
import { Validate } from './commands/validate.js';
import {
  openCheckout,
  Workspace,
  type WorkspaceOptions,
} from './workspace/workspace.js';
import { Checkout } from './containers/project.js';
import { SYSTEM_ACTOR } from './utils/tx-record.js';

import {
  isValidFolderName,
  pathExists,
  resolveTilde,
} from './utils/file-utils.js';
import { ModuleRequestError } from './exceptions/index.js';
import {
  ModuleReplayFailedError,
  ModuleValidationFailedError,
} from './mutations/replay/replay.js';
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
    systemCheckout = await openCheckout(projectPath, options);
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
    credentials?: Credentials,
  ): Promise<requestStatus> {
    // Set project path and validate it.
    const creatingNewProject = command === Cmd.create && args[0] === 'project';
    // migrate must not depend on loading the project it is about to migrate;
    // it only needs a resolved project path.
    const projectNotRequired = creatingNewProject || command === Cmd.migrate;
    if (!projectNotRequired) {
      try {
        await this.doSetProject(options);
      } catch (error) {
        return { statusCode: 400, message: errorFunction(error) };
      }
    } else if (creatingNewProject) {
      this.projectPath = options.projectPath || '';
    } else if (command === Cmd.migrate) {
      try {
        await this.resolveProjectPath(options);
      } catch (error) {
        return { statusCode: 400, message: errorFunction(error) };
      }
    }
    return await this.doHandleCommand(command, args, options, credentials);
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
    credentials?: Credentials,
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
        const [type, ...rest] = args;
        const target = this.commandType(type);
        // If 'type' was used to deduce 'target', put the parameter back into the args.
        if (target !== type) {
          rest.unshift(type);
        }
        if (target === 'project') {
          // 3rd parameter - path - is skipped it is used in general command handling
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const [name, prefix, _, category, description] = rest;
          await Create.createProject(
            resolveTilde(this.projectPath),
            prefix,
            name,
            category || '',
            description || '',
          );
        } else {
          throw new Error(`Unknown type to create: '${target}'`);
        }
      } else if (command === Cmd.fetch) {
        const [target] = args;
        if (target !== 'hubs') {
          throw new Error(`Unknown type to fetch: '${target}'`);
        }
        // An explicit fetch always contacts the hubs; the version-checked path
        // is for callers that only need the cache to be current.
        const failures = (await this.ws?.modules.fetchHubs(true)) ?? [];
        if (failures.length > 0) {
          return {
            statusCode: 500,
            message: [
              ...failures.map(
                (failure) => `${failure.location}: ${failure.message}`,
              ),
              'Modules from the hubs that could be read were refreshed.',
            ].join('\n'),
          };
        }
      } else if (command === Cmd.import) {
        const target = args.splice(0, 1)[0];
        if (target === 'module') {
          const [source, useCredentials, version] = args;
          const result = await this.import(
            source,
            useCredentials ? useCredentials === 'true' : undefined,
            credentials,
            version,
          );
          if (result) printModuleResult(result);
          return {
            statusCode: 200,
            note: await this.cleanRecommendation(),
          };
        }
        if (target === 'csv') {
          const [csvFile, cardKey] = args;
          return await this.importCsv(csvFile, cardKey);
        }
      } else if (command === Cmd.migrate) {
        return await this.migrate();
      } else if (command === Cmd.publish) {
        return this.publish(args);
      } else if (command === Cmd.version) {
        return this.version(args);
      } else if (command === Cmd.remove) {
        const [type, target] = args;
        const removed = this.commandType<RemovableResourceTypes>(type);
        await this.remove(removed, this.commandTarget(type, target));
      } else if (command === Cmd.rename) {
        const [to] = args;
        const { force } = options as RenameCommandOptions;
        const published = this.ws?.checkout.configuration.version;
        await this.ws?.renameCmd.rename(to, force);
        if (published) {
          return {
            statusCode: 200,
            note:
              `Version ${published} was published under the old prefix. The ` +
              `next version you publish is a new module: consumers must ` +
              `install it and remove the old one rather than update.`,
          };
        }
      } else if (command === Cmd.show) {
        const [type, detail] = args;
        options.projectPath = this.projectPath;
        return this.show(
          this.commandType(type),
          this.commandTarget(type, detail),
          options,
        );
      } else if (command === Cmd.updateModules) {
        const [module, targetVersion] = args;
        if (!module && targetVersion) {
          throw new ModuleRequestError(
            'A target version can only be specified together with a module name',
          );
        }
        const target = module
          ? { module, version: targetVersion || undefined }
          : {};
        if ((options as UpdateModulesCommandOptions).dryRun) {
          return {
            statusCode: 200,
            payload: await this.ws?.modules.planUpdate(target, credentials),
          };
        }
        const result = await this.ws?.modules.update(target, credentials);
        if (result) printModuleResult(result);
        return {
          statusCode: 200,
          note: await this.cleanRecommendation(),
        };
      } else if (command === Cmd.clean) {
        return this.clean(args);
      } else if (command === Cmd.validate) {
        return this.validate();
      } else {
        return { statusCode: 500, message: 'Unknown command' };
      }
    } catch (e) {
      if (
        (e instanceof ModuleReplayFailedError ||
          e instanceof ModuleValidationFailedError) &&
        e.result
      ) {
        printModuleResult(e.result);
      }
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

  // A recommendation when the project holds dormant field values, or undefined
  // when there is nothing to clean. Never fails the parent operation.
  //
  // An operation that stranded nothing still reports whatever was dormant
  // before it, so the note states what the project holds and never claims the
  // operation caused it.
  private async cleanRecommendation(): Promise<string | undefined> {
    const dormant = await this.ws?.clean.dormantSummary();
    if (!dormant) {
      return undefined;
    }
    return (
      `This project has ${dormant.valueCount} dormant field value(s) on ${dormant.cardCount} card(s) — ` +
      `run 'cyberismo clean --dry-run' to list them, 'cyberismo clean' to remove them`
    );
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

  // Imports another project to the 'destination' project as a module.
  private async import(
    source: string,
    useCredentials?: boolean,
    credentials?: Credentials,
    version?: string,
  ) {
    return this.ws?.modules.install(source, {
      private: useCredentials,
      credentials,
      version,
    });
  }

  // Imports cards from a CSV file to a project.
  private async importCsv(
    filePath: string,
    parentCardKey: string,
  ): Promise<requestStatus> {
    const cards = await this.ws?.importCmd.importCsv(filePath, parentCardKey);
    return {
      statusCode: 200,
      message: `Imported cards:`,
      payload: cards,
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

  // Shows wanted resources from a project / template.
  private async show(
    type: ResourceTypes,
    typeDetail: string,
    options: ShowCommandOptions,
  ): Promise<requestStatus> {
    const detail = typeDetail || '';
    let promise: Promise<
      | HubSetting[]
      | ModuleContent
      | ModuleInfo[]
      | ModuleSettingFromHub[]
      | undefined
    >;

    switch (type) {
      case 'importableModules':
        // The show commands read cached hub data; on the command line a stale
        // listing is never what the user asked for, so refresh it first.
        promise = this.ws!.modules.ensureModuleListUpToDate().then(() =>
          this.ws!.modules.importable(options?.showAll, options?.details),
        );
        break;
      case 'module':
        promise = this.ws!.modules.show(detail);
        break;
      case 'hubs':
        promise = this.ws!.modules.ensureModuleListUpToDate().then(() =>
          this.ws!.modules.hubs(),
        );
        break;
      case 'modules':
        promise = this.ws!.modules.list();
        break;
      case 'attachment': // fallthrough - not implemented yet
      case 'link': // fallthrough - not implemented yet
      case 'links': // fallthrough - not implemented yet
      case 'label':
      default:
        throw new Error(`Unknown or not yet handled type ${type}`);
    }
    return { statusCode: 200, payload: await Promise.resolve(promise) };
  }

  // Run migrations to bring project schema to the tool's current version
  private async migrate(): Promise<requestStatus> {
    try {
      const message = await migrateProject(this.projectPath);
      return { statusCode: 200, message };
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

// Prints what a module install or update did besides installing the modules.
function printModuleResult(result: ModuleUpdateResult | ModuleInstallResult) {
  for (const step of result.skippedReplays) {
    console.warn(
      `Skipping migration replay for module '${step.modulePrefix}' ` +
        `(${step.fromVersion} -> ${step.toVersion}): the module failed to apply.`,
    );
  }
  for (const step of result.replayed) {
    console.log(
      `Replayed migrations for module '${step.modulePrefix}': ` +
        `${step.fromVersion} -> ${step.toVersion} (${step.seals} seal(s))` +
        describeSkipped(step),
    );
  }
  if ('newValidationErrors' in result && result.newValidationErrors) {
    console.error(
      `There are new validations errors after importing the module. Check the project`,
    );
  }
}

// Retired entries are expected and no build will apply them; unknown ones
// were most likely written by a newer build, so upgrading may apply them.
function describeSkipped({ retired, unknown }: ReplayedModule): string {
  const count = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;
  const ops = (list: string[]) => [...new Set(list)].join(', ');
  let text = '';
  if (retired.length > 0) {
    text +=
      `; ignored ${count(retired.length)} for retired operations ` +
      `(${ops(retired)})`;
  }
  if (unknown.length > 0) {
    text +=
      `; skipped ${count(unknown.length)} this version does not recognise ` +
      `(${ops(unknown)}) — upgrade cyberismo to apply ` +
      `${unknown.length === 1 ? 'it' : 'them'}`;
  }
  return text;
}
