/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  Card,
  CardAttachment,
  CardListContainer,
  FileContentType,
  ModuleSettings,
  ProjectMetadata,
  RemovableResourceTypes,
  ResourceTypes,
  TemplateConfiguration,
} from './interfaces/project-interfaces.js';
import {
  CardType,
  FieldType,
  LinkType,
  ReportMetadata,
  Workflow,
} from './interfaces/resource-interfaces.js';

import { requestStatus } from './interfaces/request-status-interfaces.js';

import { Create } from './create.js';
import { CommandManager } from './command-manager.js';
import { UpdateOperations } from './resources/resource-object.js';
import { Project } from './containers/project.js';
import { Validate } from './validate.js';

import { pathExists, resolveTilde } from './utils/file-utils.js';
import { errorFunction } from './utils/log-utils.js';

// Generic options interface
export interface CardsOptions {
  details?: boolean;
  format?: string;
  output?: string;
  projectPath?: string;
  repeat?: number;
}

// Commands that this class supports.
// todo: Could be inside the `CommandHandler` ?
export enum Cmd {
  add = 'add',
  calc = 'calc',
  create = 'create',
  edit = 'edit',
  export = 'export',
  import = 'import',
  move = 'move',
  rank = 'rank',
  remove = 'remove',
  rename = 'rename',
  show = 'show',
  start = 'start',
  transition = 'transition',
  update = 'update',
  validate = 'validate',
}

// To what format the content can be exported to.
export enum ExportFormats {
  adoc = 'adoc',
  html = 'html',
  site = 'site',
}

export { CommandManager } from './command-manager.js';

// Helper class for allowed types.
export abstract class ShowTypes {
  // Show-able types
  public static allowed = [
    'attachment',
    'card',
    'cardType',
    'fieldType',
    'label',
    'linkType',
    'module',
    'project',
    'report',
    'template',
    'workflow',
  ];

  // Lists all show-able resource types.
  public static all(): string[] {
    return [...ShowTypes.pluralizeTypes(), ...ShowTypes.allowed].sort();
  }
  // Pluralizes allowed target types.
  // @note Supports English only and does not support exceptions (e.g. datum -> data).
  public static pluralizeTypes(): string[] {
    const retArray = [];
    retArray.push(...ShowTypes.allowed.map((item) => (item += 's')));
    return retArray;
  }
}

/**
 * Class that handles all CLI commands.
 */
export class Commands {
  private commands?: CommandManager;
  private projectPath: string;
  private projectPrefixes: string[] = [];
  private validateCmd: Validate;

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
    command: Cmd,
    args: string[],
    options: CardsOptions,
  ): Promise<requestStatus> {
    // Set project path and validate it.
    const creatingNewProject = command === Cmd.create && args[0] === 'project';
    if (!creatingNewProject) {
      try {
        await this.doSetProject(options.projectPath || '');
      } catch (error) {
        return { statusCode: 400, message: errorFunction(error) };
      }
    } else {
      this.projectPath = options.projectPath || '';
    }
    return await this.doHandleCommand(command, args, options);
  }

  // Handles initializing the project so that it can be used in the class.
  private async doSetProject(path: string) {
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

    this.commands = await CommandManager.getInstance(this.projectPath);
    if (!this.commands) {
      throw new Error('Cannot get instance of CommandManager');
    }
    await this.commands.initialize();
    this.projectPrefixes = await this.commands.project.projectPrefixes();
  }

  // Handles actual command. Sets returns values correctly.
  private async doHandleCommand(
    command: Cmd,
    args: string[],
    options: CardsOptions,
  ) {
    try {
      if (command === Cmd.add) {
        const [template, cardType, cardKey] = args;
        return await this.addCard(template, cardType, cardKey, options.repeat);
      } else if (command === Cmd.calc) {
        const [command, cardKey] = args;
        if (command === 'run') {
          if (!cardKey) {
            return { statusCode: 400, message: 'File path is missing' };
          }
          return this.runLogicProgram(cardKey);
        }
        if (command === 'generate') {
          return this.generateLogicProgram(cardKey);
        }
      } else if (command === Cmd.create) {
        const target: ResourceTypes = args.splice(0, 1)[0] as ResourceTypes;
        if (target === 'attachment') {
          const [cardKey, attachment] = args;
          await this.createAttachment(cardKey, attachment);
        }
        if (target === 'card') {
          const [template, parent] = args;
          return await this.createCard(template, parent);
        }
        if (target === 'cardType') {
          const [name, workflow] = args;
          await this.createCardType(name, workflow);
        }
        if (target === 'fieldType') {
          const [name, datatype] = args;
          await this.createFieldType(name, datatype);
        }
        if (target == 'label') {
          const [cardKey, label] = args;
          await this.commands?.createCmd.createLabel(cardKey, label);
        }
        if (target === 'link') {
          const [cardKey, destinationCardKey, linkType, linkDescription] = args;
          await this.commands?.createCmd.createLink(
            cardKey,
            destinationCardKey,
            linkType,
            linkDescription,
          );
        }
        if (target === 'linkType') {
          const [name] = args;
          await this.createLinkType(name);
        }
        if (target === 'project') {
          const [name, prefix] = args;
          await this.createProject(name, prefix);
        }
        if (target === 'report') {
          const [name] = args;
          await this.createReport(name);
        }
        if (target === 'template') {
          const [name, content] = args;
          await this.createTemplate(name, content);
        }
        if (target === 'workflow') {
          const [name, content] = args;
          await this.createWorkflow(name, content);
        }
      } else if (command === Cmd.edit) {
        const [cardKey] = args;
        await this.commands?.editCmd.editCard(cardKey);
      } else if (command === Cmd.export) {
        const [format, output, cardKey] = args;
        await this.export(output, format as ExportFormats, cardKey);
      } else if (command === Cmd.import) {
        const target = args.splice(0, 1)[0];
        if (target === 'module') {
          const [source] = args;
          await this.import(source);
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
        const removedType: RemovableResourceTypes =
          type as RemovableResourceTypes;
        await this.remove(removedType, target, rest);
      } else if (command === Cmd.rename) {
        const [to] = args;
        await this.commands?.renameCmd.rename(to);
      } else if (command === Cmd.show) {
        const [type, detail] = args;
        const shownTypes: ResourceTypes = type as ResourceTypes;
        options.projectPath = this.projectPath;
        return this.show(shownTypes, detail, options);
      } else if (command === Cmd.start) {
        await this.startApp();
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
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
          parsedValue = value;
        }

        await this.commands?.updateCmd.updateValue(
          resource,
          operation as UpdateOperations,
          key,
          parsedValue,
          newValue ? JSON.parse(newValue) : undefined,
        );
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

  // Adds attachment to a card.
  private async createAttachment(
    cardKey: string,
    attachmentFile: string,
  ): Promise<void> {
    return this.commands?.createCmd.createAttachment(cardKey, attachmentFile);
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
      affectsCards: createdCards,
      message: `Created cards ${JSON.stringify(createdCards)}`,
    };
  }

  // Creates a new card type.
  private async createCardType(
    cardTypeName: string,
    workflowName: string,
  ): Promise<void> {
    return this.commands?.createCmd.createCardType(cardTypeName, workflowName);
  }

  // Creates a new field type.
  private async createFieldType(
    fieldTypeName: string,
    dataType: string,
  ): Promise<void> {
    return this.commands?.createCmd.createFieldType(fieldTypeName, dataType);
  }

  // Creates a new link type.
  private async createLinkType(name: string): Promise<void> {
    return await this.commands?.createCmd.createLinkType(name);
  }

  // Creates a new project.
  private async createProject(
    projectName: string,
    prefix: string,
  ): Promise<void> {
    await Create.createProject(
      resolveTilde(this.projectPath),
      prefix,
      projectName,
    );
  }

  // Creates a new report.
  private async createReport(name: string): Promise<void> {
    return await this.commands?.createCmd.createReport(name);
  }

  // Creates a new template.
  private async createTemplate(
    templateName: string,
    templateContent: string,
  ): Promise<void> {
    return await this.commands?.createCmd.createTemplate(
      templateName,
      templateContent,
    );
  }

  // Creates a new workflow.
  private async createWorkflow(
    workflowName: string,
    workflowContent: string,
  ): Promise<void> {
    return await this.commands?.createCmd.createWorkflow(
      workflowName,
      workflowContent,
    );
  }

  // Exports whole or partial card tree to a given format.
  private async export(
    destination: string = 'output',
    format: ExportFormats,
    parentCardKey?: string,
  ): Promise<requestStatus> {
    if (!this.commands) {
      return { statusCode: 500 };
    }
    let message = '';
    if (format === 'adoc') {
      message = await this.commands?.exportCmd.exportToADoc(
        destination,
        parentCardKey,
      );
    } else if (format === 'html') {
      message = await this.commands?.exportCmd.exportToHTML(
        destination,
        parentCardKey,
      );
    } else if (format === 'site') {
      message = await this.commands?.exportSiteCmd.exportToSite(
        destination,
        parentCardKey,
      );
    }
    return { statusCode: 200, message: message };
  }

  // Generates logic program for a card.
  private async generateLogicProgram(cardKey?: string): Promise<requestStatus> {
    try {
      await this.commands?.calculateCmd.generate(cardKey);
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 500, message: errorFunction(e) };
    }
  }

  // Imports another project to the 'destination' project as a module.
  private async import(source: string): Promise<void> {
    return this.commands?.importCmd.importProject(source, this.projectPath);
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
  private async runLogicProgram(filePath: string): Promise<requestStatus> {
    try {
      const res = await this.commands?.calculateCmd.runLogicProgram({
        file: join(process.cwd(), filePath),
      });
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
    options: CardsOptions,
  ): Promise<requestStatus> {
    if (!ShowTypes.all().includes(type)) {
      throw new Error(`Input validation error: illegal type '${type}'`);
    }
    if (
      !ShowTypes.pluralizeTypes().includes(type) &&
      !typeDetail &&
      type !== 'project'
    ) {
      throw new Error(
        `Input validation error: must pass argument 'typeDetail' if requesting to show info on '${type}'`,
      );
    }
    const detail = typeDetail || '';
    let promise: Promise<
      | Card
      | CardAttachment[]
      | CardListContainer[]
      | CardType
      | FieldType
      | LinkType
      | ModuleSettings
      | ProjectMetadata
      | ReportMetadata
      | TemplateConfiguration
      | Workflow
      | string[]
      | undefined
    >;

    switch (type) {
      case 'attachments':
        promise = this.commands!.showCmd.showAttachments();
        break;
      case 'card':
        {
          const cardDetails = {
            contentType: 'adoc' as FileContentType,
            content: options?.details,
            metadata: true,
            children: options?.details,
            parent: options?.details,
            attachments: true,
          };
          promise = this.commands!.showCmd.showCardDetails(cardDetails, detail);
        }
        break;
      case 'cards':
        promise = this.commands!.showCmd.showCards();
        break;
      case 'cardType':
      case 'fieldType':
      case 'linkType':
      case 'workflow':
        promise = this.commands!.showCmd.showResource(detail);
        break;
      case 'cardTypes':
        promise = this.commands!.showCmd.showCardTypes();
        break;
      case 'fieldTypes':
        promise = this.commands!.showCmd.showFieldTypes();
        break;
      case 'labels':
        promise = this.commands!.showCmd.showLabels();
        break;
      case 'linkTypes':
        promise = this.commands!.showCmd.showLinkTypes();
        break;
      case 'module':
        promise = this.commands!.showCmd.showModule(detail);
        break;
      case 'modules':
        promise = this.commands!.showCmd.showModules();
        break;
      case 'project':
        promise = this.commands!.showCmd.showProject();
        break;
      case 'report':
        promise = this.commands!.showCmd.showReport(detail);
        break;
      case 'reports':
        promise = this.commands!.showCmd.showReports();
        break;
      case 'template':
        promise = this.commands!.showCmd.showTemplate(detail);
        break;
      case 'templates':
        promise = this.commands!.showCmd.showTemplates();
        break;
      case 'workflows':
        promise = this.commands!.showCmd.showWorkflows();
        break;
      case 'attachment': // fallthrough - not implemented yet
      case 'link': // fallthrough - not implemented yet
      case 'links': // fallthrough - not implemented yet
      case 'projects': // fallthrough - not possible
      case 'label':
      default:
        throw new Error(`Unknown or not yet handled type ${type}`);
    }
    return { statusCode: 200, payload: await Promise.resolve(promise) };
  }

  // Starts the Cyberismo app by running npm start in the app project folder
  private async startApp(): Promise<void> {
    console.log('Running Cyberismo app on http://localhost:3000/');
    console.log('Press Control+C to stop.');

    // __dirname when running cards ends with /tools/data-handler/dist - use that to navigate to app path
    const baseDir = dirname(fileURLToPath(import.meta.url));
    const appPath = resolve(baseDir, '../../app');

    // since current working directory changes, we need to resolve the project path
    const projectPath = resolve(this.projectPath);

    const args = [`start`];
    execFileSync(`npm`, args, {
      shell: true,
      cwd: appPath,
      stdio: 'ignore',
      env: { ...process.env, npm_config_project_path: projectPath },
    });
  }

  // Validates that a given path conforms to schema. Validates both file/folder structure and file content.
  private async validate(): Promise<requestStatus> {
    const result = await this.validateCmd.validate(this.projectPath);
    return {
      statusCode: 200,
      message: result.length ? result : 'Project structure validated',
    };
  }
}
