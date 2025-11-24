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
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import type {
  Card,
  CardAttachment,
  CardListContainer,
  Credentials,
  ModuleContent,
  ModuleSettingFromHub,
  ProjectMetadata,
  RemovableResourceTypes,
  ResourceTypes,
} from './interfaces/project-interfaces.js';
import type {
  DataType,
  AnyResourceContent,
} from './interfaces/resource-interfaces.js';
import type {
  AddCommandOptions,
  AllCommandOptions,
  CalcCommandOptions,
  ExportCommandOptions,
  ReportCommandOptions,
  ShowCommandOptions,
  StartCommandOptions,
  UpdateCommandOptions,
} from './interfaces/command-options.js';

import type { requestStatus } from './interfaces/request-status-interfaces.js';

import { Create } from './commands/create.js';
import { Validate } from './commands/validate.js';
import { CommandManager } from './command-manager.js';
import type { UpdateOperations } from './resources/resource-object.js';
import { Project } from './containers/project.js';

import { pathExists, resolveTilde } from './utils/file-utils.js';
import { errorFunction } from './utils/error-utils.js';
import { readJsonFile } from './utils/json.js';
import { resourceName } from './utils/resource-utils.js';

import { type Level } from 'pino';
import { type Context } from './interfaces/project-interfaces.js';
import { type QueryName } from './types/queries.js';

// Commands that this class supports.
export const Cmd = {
  add: 'add',
  calc: 'calc',
  create: 'create',
  edit: 'edit',
  export: 'export',
  fetch: 'fetch',
  import: 'import',
  move: 'move',
  rank: 'rank',
  remove: 'remove',
  rename: 'rename',
  report: 'report',
  show: 'show',
  start: 'start',
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

export { CommandManager } from './command-manager.js';

/**
 * Class that handles all CLI commands.
 */
export class Commands {
  private commands?: CommandManager;
  private projectPath: string;
  private validateCmd: Validate;
  private level?: Level;

  constructor() {
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
    if (!creatingNewProject) {
      try {
        await this.doSetProject(options);
      } catch (error) {
        return { statusCode: 400, message: errorFunction(error) };
      }
    } else {
      this.projectPath = options.projectPath || '';
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

  // Handles initializing the project so that it can be used in the class.
  private async doSetProject(options: AllCommandOptions) {
    const path = options.projectPath || '';
    this.projectPath = resolveTilde(await this.setProjectPath(path));
    if (!Validate.validateFolder(this.projectPath)) {
      let errorMessage = '';
      if (path === '' || path === undefined) {
        errorMessage = `No 'cardRoot' in the current folder`;
      } else {
        errorMessage = `Input validation error: folder name '${path}' is invalid`;
      }
      throw new Error(errorMessage);
    }

    if (!pathExists(this.projectPath)) {
      throw new Error(`Input validation error: cannot find project '${path}'`);
    }

    this.commands = await CommandManager.getInstance(this.projectPath, {
      logLevel: options.logLevel,
      watchResourceChanges: (options as StartCommandOptions)
        .watchResourceChanges,
    });
    if (!this.commands) {
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
      if (command === Cmd.add) {
        const [type, target, cardType, cardKey] = args;
        if (type === 'card') {
          return await this.addCard(
            target,
            cardType,
            cardKey,
            (options as AddCommandOptions).repeat,
          );
        }
        if (type === 'hub') {
          return await this.addHub(target);
        }
      } else if (command === Cmd.calc) {
        const [command, ...rest] = args;
        if (command === 'run') {
          const [cardKey] = rest;
          if (!cardKey) {
            return { statusCode: 400, message: 'File path is missing' };
          }
          await this.generateLogicProgram();
          return this.runLogicProgram(
            cardKey,
            (options as CalcCommandOptions).context || 'localApp',
          );
        }
        if (command === 'generate') {
          const [destination, query] = rest;
          await this.generateLogicProgram();
          return this.exportLogicProgram(destination, query);
        }
      } else if (command === Cmd.create) {
        const [type, ...rest] = args;
        const target = this.commandType(type);
        // If 'type' was used to deduce 'target', put the parameter back into the args.
        if (target !== type) {
          rest.unshift(type);
        }
        if (target === 'attachment') {
          const [cardKey, attachment] = rest;
          await this.commands?.createCmd.createAttachment(cardKey, attachment);
        } else if (target === 'card') {
          const [template, parent] = rest;
          return await this.createCard(template, parent);
        } else if (target === 'cardType') {
          const [name, workflow] = rest;
          await this.commands?.createCmd.createCardType(name, workflow);
        } else if (target === 'fieldType') {
          const [name, datatype] = rest;
          await this.commands?.createCmd.createFieldType(
            name,
            datatype as DataType,
          );
        } else if (target === 'graphModel') {
          const [name] = rest;
          await this.commands?.createCmd.createGraphModel(name);
        } else if (target === 'graphView') {
          const [name] = rest;
          await this.commands?.createCmd.createGraphView(name);
        } else if (target == 'label') {
          const [cardKey, label] = rest;
          await this.commands?.createCmd.createLabel(cardKey, label);
        } else if (target === 'link') {
          const [cardKey, destinationCardKey, linkType, linkDescription] = rest;
          await this.commands?.createCmd.createLink(
            cardKey,
            destinationCardKey,
            linkType,
            linkDescription,
          );
        } else if (target === 'linkType') {
          const [name] = rest;
          await this.commands?.createCmd.createLinkType(name);
        } else if (target === 'project') {
          const [name, prefix] = rest;
          await Create.createProject(
            resolveTilde(this.projectPath),
            prefix,
            name,
          );
        } else if (target === 'report') {
          const [name] = rest;
          await this.commands?.createCmd.createReport(name);
        } else if (target === 'template') {
          const [name, content] = rest;
          await this.commands?.createCmd.createTemplate(name, content);
        } else if (target === 'workflow') {
          const [name, content] = rest;
          await this.commands?.createCmd.createWorkflow(name, content);
        } else {
          throw new Error(`Unknown type to create: '${target}'`);
        }
      } else if (command === Cmd.edit) {
        const [cardKey] = args;
        await this.commands?.editCmd.editCard(cardKey);
      } else if (command === Cmd.export) {
        const [format, output, cardKey] = args;
        return await this.export(
          output,
          format as ExportFormats,
          cardKey,
          options,
        );
      } else if (command === Cmd.fetch) {
        const [target] = args;
        if (target !== 'hubs') {
          throw new Error(`Unknown type to fetch: '${target}'`);
        }
        await this.commands?.fetchCmd.fetchHubs();
      } else if (command === Cmd.import) {
        const target = args.splice(0, 1)[0];
        if (target === 'module') {
          const [source, branch, useCredentials] = args;
          await this.import(
            source,
            branch,
            useCredentials && useCredentials === 'true' ? true : false,
            credentials,
          );
        }
        if (target === 'csv') {
          const [csvFile, cardKey] = args;
          return await this.importCsv(csvFile, cardKey);
        }
      } else if (command === Cmd.move) {
        const [source, destination] = args;
        await this.commands?.moveCmd.moveCard(source, destination);
      } else if (command === Cmd.rank) {
        const target = args.splice(0, 1)[0];
        if (target === 'card') {
          const [card, before] = args;
          if (before === 'first') {
            await this.commands?.moveCmd.rankFirst(card);
          } else {
            await this.commands?.moveCmd.rankCard(card, before);
          }
        } else if (target === 'rebalance') {
          const [cardKey] = args;
          if (cardKey) {
            await this.commands?.moveCmd.rebalanceChildren(cardKey);
          } else {
            await this.commands?.moveCmd.rebalanceProject();
          }
        }
      } else if (command === Cmd.remove) {
        const [type, target, ...rest] = args;
        await this.remove(
          this.commandType(type),
          this.commandTarget(type, target),
          rest,
        );
      } else if (command === Cmd.rename) {
        const [to] = args;
        await this.commands?.renameCmd.rename(to);
      } else if (command === Cmd.show) {
        const [type, detail] = args;
        options.projectPath = this.projectPath;
        return this.show(
          this.commandType(type),
          this.commandTarget(type, detail),
          options,
        );
      } else if (command === Cmd.report) {
        const [parameters, outputPath] = args;
        return this.runReport(
          parameters,
          (options as ReportCommandOptions).context || 'localApp',
          outputPath,
        );
      } else if (command === Cmd.start) {
        return this.startApp((options as StartCommandOptions).forceStart);
      } else if (command === Cmd.transition) {
        const [cardKey, state] = args;
        await this.commands?.transitionCmd.cardTransition(cardKey, {
          name: state,
        });
      } else if (command === Cmd.update) {
        const [resource, operation, key, value, newValue] = args;
        let parsedValue = '';
        try {
          parsedValue = JSON.parse(value);
        } catch {
          parsedValue = value;
        }

        // Handle mapping file for workflow changes
        let mappingTable: { stateMapping: Record<string, string> } | undefined;
        if (
          (options as UpdateCommandOptions).mappingFile &&
          operation === 'change' &&
          key === 'workflow'
        ) {
          try {
            const mappingData = await readJsonFile(
              resolveTilde((options as UpdateCommandOptions).mappingFile!),
            );
            if (
              mappingData &&
              typeof mappingData === 'object' &&
              'stateMapping' in mappingData
            ) {
              mappingTable = mappingData as {
                stateMapping: Record<string, string>;
              };
            } else {
              throw new Error(
                'Mapping file must contain a "stateMapping" object',
              );
            }
          } catch (error) {
            throw new Error(
              `Failed to read mapping file: ${errorFunction(error)}`,
            );
          }
        }

        let parsedNewValue = newValue;
        if (newValue) {
          try {
            parsedNewValue = JSON.parse(newValue);
          } catch {
            parsedNewValue = newValue;
          }
        }

        await this.commands?.updateCmd.updateValue(
          resource,
          operation as UpdateOperations,
          key,
          parsedValue,
          parsedNewValue,
          mappingTable,
        );
      } else if (command === Cmd.updateModules) {
        const [module] = args;
        if (module) {
          await this.commands?.importCmd.updateModule(module, credentials);
        } else {
          await this.commands?.importCmd.updateAllModules(credentials);
        }
      } else if (command === Cmd.validate) {
        return this.validate();
      } else {
        return { statusCode: 500, message: 'Unknown command' };
      }
    } catch (e) {
      return { statusCode: 400, message: errorFunction(e) };
    }
    return { statusCode: 200 };
  }

  /**
   * Returns project path, if running operation within project folder.
   * @param path Initial path from where the project path search is started.
   */
  public async getProjectPath(path?: string): Promise<string> {
    return this.setProjectPath(path);
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
      path = await Project.findProjectRoot(process.cwd());
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

  // Adds a new card to a template.
  private async addCard(
    templateName: string,
    cardTypeName: string,
    cardKey: string,
    repeat?: number,
  ): Promise<requestStatus> {
    const addedCards = await this.commands?.createCmd.addCards(
      cardTypeName,
      templateName,
      cardKey,
      repeat,
    );

    if (!addedCards || addedCards.length === 0) {
      throw new Error('Failed to add cards');
    }

    const messageTxt =
      addedCards.length > 1
        ? `${addedCards.length} cards were added to the template '${templateName} : ${JSON.stringify(addedCards)}'`
        : `card '${addedCards[0]}' was added to the template '${templateName}'`;

    return {
      statusCode: 200,
      affectsCards: addedCards,
      message: messageTxt,
    };
  }

  // Adds a hub to the project.
  private async addHub(name: string) {
    await this.commands?.createCmd.addHubLocation(name);
    return {
      statusCode: 200,
      message: `Hub '${name}' was added to the project`,
    };
  }

  // Creates a new card to a project, or to a template.
  private async createCard(
    templateName: string,
    parentCardKey: string,
  ): Promise<requestStatus> {
    const createdCards = await this.commands?.createCmd.createCard(
      templateName,
      parentCardKey,
    );
    return {
      statusCode: 200,
      affectsCards: createdCards?.map((card) => card.key),
      message: `Created cards ${JSON.stringify(createdCards?.map((card) => card.key))}`,
    };
  }

  // Exports whole or partial card tree to a given format.
  private async export(
    destination: string = 'output',
    format: ExportFormats,
    parentCardKey?: string,
    pdfOptions?: ExportCommandOptions,
  ): Promise<requestStatus> {
    if (!this.commands) {
      return { statusCode: 500 };
    }
    process.env.EXPORT_FORMAT = format;
    let message = '';
    if (format === 'pdf') {
      const options = {
        title: pdfOptions?.title || 'Title',
        name: pdfOptions?.name || 'Name',
        version: pdfOptions?.version || '1.0.0',
        revremark: pdfOptions?.revremark || 'Initial version',
        cardKey: parentCardKey,
        date: pdfOptions?.date ? new Date(pdfOptions.date) : new Date(),
      };
      message = await this.commands?.exportCmd.exportPdf(destination, options);
    } else {
      message = await this.commands?.exportCmd.exportToADoc(
        destination,
        parentCardKey,
      );
    }
    process.env.EXPORT_FORMAT = '';
    return { statusCode: 200, message: message };
  }

  // Generates logic program for a card.
  private async generateLogicProgram(): Promise<requestStatus> {
    try {
      await this.commands?.calculateCmd.generate();
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 500, message: errorFunction(e) };
    }
  }

  private async exportLogicProgram(
    destination: string,
    query?: string,
  ): Promise<requestStatus> {
    try {
      await this.commands?.calculateCmd.exportLogicProgram(
        destination,
        ['all'],
        query as QueryName, // TODO: validate with zod
      );
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 500, message: errorFunction(e) };
    }
  }

  // Imports another project to the 'destination' project as a module.
  private async import(
    source: string,
    branch?: string,
    useCredentials?: boolean,
    credentials?: Credentials,
  ) {
    return this.commands?.importCmd.importModule(source, this.projectPath, {
      branch: branch,
      private: useCredentials,
      credentials,
    });
  }

  // Imports cards from a CSV file to a project.
  private async importCsv(
    filePath: string,
    parentCardKey: string,
  ): Promise<requestStatus> {
    const cards = await this.commands?.importCmd.importCsv(
      filePath,
      parentCardKey,
    );
    return {
      statusCode: 200,
      message: `Imported cards:`,
      payload: cards,
    };
  }

  // Removes a card (single card, or parent card and children), or an attachment.
  private async remove(
    type: RemovableResourceTypes,
    targetName: string,
    args: string[],
  ): Promise<void> {
    return await this.commands?.removeCmd.remove(type, targetName, ...args);
  }

  // Runs a given logic program along with the query-language
  private async runLogicProgram(
    filePath: string,
    context: Context,
  ): Promise<requestStatus> {
    try {
      const res = await this.commands?.calculateCmd.runLogicProgram(
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

  // Runs a report using Handlebars and the provided parameters.
  private async runReport(
    parametersPath: string,
    context: Context,
    outputPath?: string,
  ) {
    const parametersFile = await readJsonFile(parametersPath);

    // Validate the parameters file.
    if (!parametersFile.name) {
      return {
        statusCode: 500,
        message:
          'The parameters file must include a "name" field (report name).',
      };
    }
    if (!parametersFile.parameters) {
      return {
        statusCode: 500,
        message:
          'The parameters file must include a "parameters" field (report parameters).',
      };
    }
    if (!parametersFile.parameters.cardKey) {
      return {
        statusCode: 500,
        message:
          'The parameters file must include a "cardKey" field included in the "parameters".',
      };
    }

    const { name, parameters } = parametersFile;
    let result: string | undefined = '';
    try {
      result = await this.commands?.showCmd.showReportResults(
        name,
        parameters.cardKey,
        parameters,
        context,
        outputPath,
      );
    } catch (e) {
      return { statusCode: 500, message: errorFunction(e) };
    }

    const message = !result && !outputPath ? 'No report results' : result;
    return { statusCode: 200, message: message };
  }

  // Shows wanted resources from a project / template.
  private async show(
    type: ResourceTypes,
    typeDetail: string,
    options: ShowCommandOptions,
  ): Promise<requestStatus> {
    const detail = typeDetail || '';
    let promise: Promise<
      | Card
      | CardAttachment[]
      | CardListContainer[]
      | ModuleContent
      | ModuleSettingFromHub[]
      | ProjectMetadata
      | AnyResourceContent
      | string[]
      | undefined
    >;

    switch (type) {
      case 'attachments':
        promise = this.commands!.showCmd.showAttachments();
        break;
      case 'card': {
        return {
          statusCode: 200,
          payload: this.commands!.showCmd.showCardDetails(detail),
        };
      }
      case 'cards':
        promise = this.commands!.showCmd.showCards();
        break;
      case 'calculation':
      case 'cardType':
      case 'fieldType':
      case 'graphView':
      case 'graphModel':
      case 'linkType':
      case 'report':
      case 'template':
      case 'workflow':
        promise = this.commands!.showCmd.showResource(detail, options.showUse);
        break;
      case 'calculations':
      case 'cardTypes':
      case 'fieldTypes':
      case 'graphModels':
      case 'graphViews':
      case 'linkTypes':
      case 'reports':
      case 'templates':
      case 'workflows':
        promise = this.commands!.showCmd.showResources(type);
        break;
      case 'importableModules':
        promise = this.commands!.showCmd.showImportableModules(
          options?.showAll,
          options?.details,
        );
        break;
      case 'labels':
        return {
          statusCode: 200,
          payload: this.commands!.showCmd.showLabels(),
        };
      case 'module':
        promise = this.commands!.showCmd.showModule(detail);
        break;
      case 'hubs':
        return {
          statusCode: 200,
          payload: this.commands!.showCmd.showHubs(),
        };
      case 'modules':
        return {
          statusCode: 200,
          payload: this.commands!.showCmd.showModules(),
        };
        break;
      case 'project':
        promise = this.commands!.showCmd.showProject();
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

  // Starts the Cyberismo app by running npm start in the app project folder
  private async startApp(forceStart: boolean = false): Promise<requestStatus> {
    // __dirname when running cards ends with /tools/data-handler/dist - use that to navigate to app path
    const baseDir =
      import.meta.dirname ?? new URL('.', import.meta.url).pathname;
    const appPath = resolve(baseDir, '../../app');

    // since current working directory changes, we need to resolve the project path
    const projectPath = resolve(this.projectPath);

    if (!this.commands) {
      return { statusCode: 500, message: 'Commands not initialized' };
    }

    if (!forceStart) {
      const validationErrors = await this.validateCmd.validate(
        projectPath,
        () => this.commands!.project,
      );
      if (validationErrors) {
        return { statusCode: 400, message: validationErrors };
      }
    }

    console.log('Running Cyberismo app on http://localhost:3000/');
    console.log('Press Control+C to stop.');

    const args = [`start`];
    execFileSync(`npm`, args, {
      shell: true,
      cwd: appPath,
      stdio: 'ignore',
      env: { ...process.env, npm_config_project_path: projectPath },
    });

    return { statusCode: 200 };
  }

  // Validates that a given path conforms to schema. Validates both file/folder structure and file content.
  private async validate(): Promise<requestStatus> {
    if (!this.commands) {
      return { statusCode: 500, message: 'Commands not initialized' };
    }
    const result = await this.validateCmd.validate(
      this.projectPath,
      () => this.commands!.project,
    );
    return {
      statusCode: 200,
      message: result.length ? result : 'Project structure validated',
    };
  }
}
