/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { basename, dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

import { pathExists, resolveTilde } from './utils/file-utils.js';
import { Project } from './containers/project.js';
import { requestStatus } from './interfaces/request-status-interfaces.js';
import { Validate } from './validate.js';
import { fileURLToPath } from 'node:url';
import { errorFunction } from './utils/log-utils.js';
import {
  Card,
  CardAttachment,
  CardListContainer,
  CardType,
  FieldTypeDefinition,
  LinkType,
  ModuleSettings,
  ProjectMetadata,
  RemovableResourceTypes,
  ResourceTypes,
  Template,
  TemplateMetadata,
  WorkflowMetadata,
} from './interfaces/project-interfaces.js';
import { resourceNameParts } from './utils/resource-utils.js';
import { DefaultContent } from './create-defaults.js';
import { CommandManager } from './command-manager.js';
import { Create } from './create.js';
const invalidNames = new RegExp(
  '[<>:"/\\|?*\x00-\x1F]|^(?:aux|con|clock$|nul|prn|com[1-9]|lpt[1-9])$', // eslint-disable-line no-control-regex
);

// Generic options interface
export interface CardsOptions {
  details?: boolean;
  format?: string;
  output?: string;
  projectPath?: string;
  repeat?: number;
}

export enum Cmd {
  add = 'add',
  calc = 'calc',
  create = 'create',
  edit = 'edit',
  export = 'export',
  import = 'import',
  move = 'move',
  remove = 'remove',
  rename = 'rename',
  show = 'show',
  start = 'start',
  transition = 'transition',
  validate = 'validate',
  rank = 'rank',
}

export { CommandManager } from './command-manager.js';

/**
 * Class that handles all commands.
 */
export class Commands {
  private commands?: CommandManager;
  private projectPath: string;
  private validateCmd: Validate;

  constructor() {
    this.projectPath = '';
    this.validateCmd = Validate.getInstance();
  }

  public static allowedTypes = [
    'attachment',
    'card',
    'cardType',
    'fieldType',
    'linkType',
    'module',
    'project',
    'report',
    'template',
    'workflow',
  ];

  public static removableTypes = [
    'attachment',
    'card',
    'link',
    'linkType',
    'module',
    'template',
  ];

  // Lists all allowed resource types.
  public allAllowedTypes(): string[] {
    return [...this.pluralizeTypes(), ...Commands.allowedTypes].sort();
  }

  // Checks if card exists in project or template.
  private async cardExists(cardKey?: string): Promise<boolean> {
    if (cardKey) {
      const card = await this.commands?.project.findSpecificCard(cardKey);
      return !!card;
    }
    return false;
  }

  // Pluralizes allowed target types.
  // Note that this is english only and does not support exceptions (e.g. datum -> data).
  private pluralizeTypes(): string[] {
    const retArray = [];
    retArray.push(...Commands.allowedTypes.map((item) => (item += 's')));
    return retArray;
  }

  // Sets project path, if running operation within project folder.
  private async setProjectPath(path?: string): Promise<string> {
    if (!path) {
      path = await Project.findProjectRoot(process.cwd());
      if (path === '') {
        throw new Error(
          "If project path is not given, the command must be run inside a project's folder.",
        );
        /*
                // when sinon is used for testing, use this instead. Otherwise, cannot have unit tests that cause process exit.
                console.error('No path defined - exiting');
                process.exit(1);
                */
      }
    }

    if (this.isProjectPath(path)) {
      return path;
    } else {
      console.error(
        `Invalid path '${path}'. Project must have '.cards' and 'cardRoot' folders`,
      );
      return '';
    }
  }

  // Check that path is a project path
  private isProjectPath(path: string) {
    const cardsPath = resolve(join(path, '.cards'));
    const cardRootPath = resolve(join(path, 'cardRoot'));
    return pathExists(cardsPath) && pathExists(cardRootPath);
  }

  // Validates folder name
  private validateFolder(path: string): boolean {
    if (path === '' || path === '.' || path === '..') {
      return false;
    }
    return !invalidNames.test(basename(path));
  }

  // Validates that new name of a resource is according to naming convention.
  private validateNameResourceName(name: string) {
    const validName = new RegExp('^[A-Za-z ._-]+$');
    const contentValidated = validName.test(name);
    const lengthValidated = name.length > 0 && name.length < 256;
    return contentValidated && lengthValidated;
  }

  // Validate that long and shoer resource names are valid.
  // Returns resource name as valid resource name (long format); in error case return empty string.
  // @todo: replace 'resourceType: string' with `resourceTypes: ResourceTypes` once INTDEV-463 has been merged.
  private validName(resourceType: string, resourceName: string): string {
    try {
      const project = new Project(this.projectPath);
      const { prefix, type, name } = resourceNameParts(resourceName);
      const validatePrefix = prefix !== '';
      const validateType = type !== '';
      if (validatePrefix) {
        const projectPrefix = project.projectPrefix;
        if (prefix !== projectPrefix) {
          console.error(
            `Resource name can only refer to project that it is part of. Prefix '${prefix}' does not match '${projectPrefix}'`,
          );
          return '';
        }
      }
      if (validateType && resourceType !== type) {
        console.error(
          `Resource name must match the resource type. Type '${type}' does not match '${resourceType}'`,
        );
        return '';
      }
      if (!this.validateNameResourceName(name)) {
        console.error(`Resource name must follow naming rules`);
        return '';
      }
      return `${project.projectPrefix}/${resourceType}/${name}`;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      return '';
    }
  }

  // Validates project prefix.
  private validatePrefix(prefix: string) {
    const validPrefix = new RegExp('^[a-z]+$');
    const contentValidated = validPrefix.test(prefix);
    const lengthValidated = prefix.length > 2 && prefix.length < 11;
    return contentValidated && lengthValidated;
  }

  /**
   * Executes one command for CLI.
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
    this.projectPath = '';
    // Set project path and validate it.
    const creatingNewProject = command === Cmd.create && args[0] === 'project';
    if (!creatingNewProject) {
      this.projectPath = await this.setProjectPath(options.projectPath);
      this.projectPath = resolveTilde(this.projectPath);

      if (!this.validateFolder(this.projectPath)) {
        return {
          statusCode: 400,
          message: `Input validation error: folder name is invalid '${options.projectPath}'`,
        };
      }

      if (!pathExists(this.projectPath)) {
        return {
          statusCode: 400,
          message: `Input validation error: cannot find project '${options.projectPath}'`,
        };
      }

      try {
        this.commands = CommandManager.getInstance(this.projectPath);
      } catch (e) {
        return { statusCode: 400, message: errorFunction(e) };
      }
    } else {
      this.projectPath = options.projectPath || '';
    }
    try {
      if (command === Cmd.add) {
        const [template, cardType, cardKey] = args;
        return this.addCard(
          template,
          cardType,
          cardKey,
          this.projectPath,
          options.repeat,
        );
      }
      if (command === Cmd.calc) {
        const [command, cardKey] = args;
        if (command === 'run') {
          if (!cardKey) {
            return { statusCode: 400, message: 'Card key is missing' };
          }
          return this.runLogicProgram(cardKey);
        }
        if (command === 'generate') {
          return this.generateLogicProgram(cardKey);
        }
      }
      if (command === Cmd.create) {
        const target: ResourceTypes = args.splice(0, 1)[0] as ResourceTypes;
        if (target === 'attachment') {
          const [cardKey, attachment] = args;
          return this.createAttachment(cardKey, attachment);
        }
        if (target === 'card') {
          const [template, parent] = args;
          return this.createCard(template, parent);
        }
        if (target === 'cardType') {
          const [name, workflow] = args;
          return this.createCardType(name, workflow);
        }
        if (target === 'project') {
          const [name, prefix] = args;
          return this.createProject(this.projectPath, prefix, name); // todo: order of parameters
        }
        if (target === 'template') {
          const [name, content] = args;
          return this.createTemplate(name, content);
        }
        if (target === 'fieldType') {
          const [name, datatype] = args;
          return this.createFieldType(name, datatype);
        }
        if (target === 'link') {
          const [cardKey, linkType, destinationCardKey, linkDescription] = args;
          return this.createLink(
            cardKey,
            destinationCardKey,
            linkType,
            linkDescription,
          );
        }
        if (target === 'linkType') {
          const [name] = args;
          return this.createLinkType(name);
        }
        if (target === 'workflow') {
          const [name, content] = args;
          return this.createWorkflow(name, content);
        }
        if (target === 'report') {
          const [name] = args;
          return this.createReport(name);
        }
      }
      if (command === Cmd.edit) {
        const [cardKey] = args;
        return this.edit(cardKey, options);
      }
      if (command === Cmd.export) {
        const [format, output, cardKey] = args;
        return this.export(output, cardKey, format);
      }
      if (command === Cmd.import) {
        const target = args.splice(0, 1)[0];
        if (target === 'module') {
          const [source] = args;
          return this.import(source, this.projectPath);
        }
        if (target === 'csv') {
          const [csvFile, cardKey] = args;
          return this.importCsv(csvFile, cardKey);
        }
      }
      if (command === Cmd.move) {
        const [source, destination] = args;
        try {
          await this.commands?.moveCmd.moveCard(source, destination);
          return { statusCode: 200 };
        } catch (error) {
          return { statusCode: 400, message: errorFunction(error) };
        }
      }
      if (command === Cmd.rank) {
        const target = args.splice(0, 1)[0];
        if (target === 'card') {
          const [card, before] = args;
          try {
            if (before === 'first') {
              await this.commands?.moveCmd.rankFirst(card);
            } else {
              await this.commands?.moveCmd.rankCard(card, before);
            }
            return { statusCode: 200 };
          } catch (e) {
            return { statusCode: 400, message: errorFunction(e) };
          }
        }
        if (target === 'rebalance') {
          const [cardKey] = args;
          try {
            if (cardKey) {
              await this.commands?.moveCmd.rebalanceChildren(cardKey);
            } else {
              await this.commands?.moveCmd.rebalanceProject();
            }
            return { statusCode: 200 };
          } catch (e) {
            return { statusCode: 400, message: errorFunction(e) };
          }
        }
      }
      if (command === Cmd.remove) {
        const [type, target, ...rest] = args;
        const removedType: RemovableResourceTypes =
          type as RemovableResourceTypes;
        return this.remove(removedType, target, rest);
      }
      if (command === Cmd.rename) {
        const [to] = args;
        return this.rename(to);
      }
      if (command === Cmd.show) {
        const [type, detail] = args;
        const shownTypes: ResourceTypes = type as ResourceTypes;
        options.projectPath = this.projectPath;
        return this.show(shownTypes, detail, options);
      }
      if (command === Cmd.start) {
        return this.startApp(this.projectPath);
      }
      if (command === Cmd.transition) {
        const [cardKey, state] = args;
        return this.transition(cardKey, state);
      }
      if (command === Cmd.validate) {
        return this.validate(this.projectPath);
      }
    } catch (e) {
      return { statusCode: 400, message: errorFunction(e) };
    }

    return { statusCode: 500, message: 'Unknown command' };
  }

  /**
   *  Adds a new card to a template.
   * @param {string} templateName Name of a template.
   * @param {string} cardTypeName Card-type for the new card.
   * @param {string} cardKey Optional, parent cardKey, if any. If omitted, the new card will be created to root level.
   * @param {string} path Optional, path to the project. If omitted, project is set from current path.
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   */
  private async addCard(
    templateName: string,
    cardTypeName: string,
    cardKey: string,
    path: string,
    repeat?: number,
  ): Promise<requestStatus> {
    const templateFolder = join(path, templateName);
    if (!templateName || !this.validateFolder(templateFolder)) {
      return {
        statusCode: 400,
        message: `Input validation error: template name is invalid '${templateName}'`,
      };
    }
    if (cardTypeName === undefined) {
      return {
        statusCode: 400,
        message: `Input validation error: card type cannot be empty`,
      };
    }
    try {
      const addedCards = await this.commands?.createCmd.addCards(
        path,
        cardTypeName,
        templateName,
        cardKey,
        repeat,
      );

      if (!addedCards || addedCards.length === 0) {
        throw new Error('error');
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
    } catch (e) {
      return {
        statusCode: 400,
        message: errorFunction(e),
      };
    }
  }
  /**
   * Runs a given logic program along with the query-language
   * @param filePath Path to the file
   * @returns
   */
  private async runLogicProgram(filePath: string): Promise<requestStatus> {
    try {
      return {
        statusCode: 200,
        payload: await this.commands?.calculateCmd.run({
          file: join(process.cwd(), filePath),
        }),
      };
    } catch (e) {
      return { statusCode: 500, message: errorFunction(e) };
    }
  }

  /**
   * Generates logic program for a card.
   * @param cardKey optional, if defined, logic program is generated for the subtree of the card
   * @returns statusCode 200 when operation succeeded
   * <br> statusCode 500 when there was a internal problem generating logic program
   */
  private async generateLogicProgram(cardKey?: string): Promise<requestStatus> {
    try {
      await this.commands?.calculateCmd.generate(cardKey);
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 500, message: errorFunction(e) };
    }
  }

  /**
   * Adds attachment to a card.
   * @param {string} cardKey card key
   * @param {string} attachment path to attachment
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   *  <br> statusCode 500 when there was a internal problem creating attachment
   */
  private async createAttachment(
    cardKey: string,
    attachment: string,
  ): Promise<requestStatus> {
    if (!pathExists(attachment)) {
      return {
        statusCode: 400,
        message: `Input validation error: cannot find attachment '${attachment}'`,
      };
    }
    try {
      await this.commands?.createCmd.createAttachment(cardKey, attachment);
    } catch (e) {
      return { statusCode: 400, message: errorFunction(e) };
    }
    return { statusCode: 200 };
  }

  /**
   * Creates a new card to a project, or to a template.
   * @param {string} templateName which template to use
   * @param {string} parentCardKey parent for the new card
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   */
  private async createCard(
    templateName: string,
    parentCardKey: string,
  ): Promise<requestStatus> {
    if (parentCardKey === undefined) {
      parentCardKey = '';
    }
    try {
      const createdCards = await this.commands?.createCmd.createCard(
        templateName,
        parentCardKey,
      );
      return {
        statusCode: 200,
        affectsCards: createdCards,
        message: `Created cards ${JSON.stringify(createdCards)}`,
      };
    } catch (e) {
      return { statusCode: 400, message: errorFunction(e) };
    }
  }

  /**
   * Creates a new card type.
   * @param cardTypeName Name of the card type.
   * @param workflowName Name of the workflow that the card type uses.
   * @returns request status
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   *  <br> statusCode 500 when there was a internal problem creating card type
   */
  private async createCardType(
    cardTypeName: string,
    workflowName: string,
  ): Promise<requestStatus> {
    const validCardTypeName = this.validName('cardTypes', cardTypeName);
    const validWorkflowName = this.validName('workflows', workflowName);
    if (validCardTypeName === '') {
      return {
        statusCode: 400,
        message: `Input validation error: invalid card type name '${cardTypeName}'`,
      };
    }
    if (validWorkflowName === '') {
      return {
        statusCode: 400,
        message: `Input validation error: invalid workflow name '${workflowName}'`,
      };
    }
    try {
      await this.commands?.createCmd.createCardType(
        validCardTypeName,
        validWorkflowName,
      );
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 400, message: errorFunction(e) };
    }
  }

  /**
   * Creates a new field type.
   * @param fieldTypeName Name of the field type.
   * @param dataType Name of the field type.
   * @returns request status
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   *  <br> statusCode 400 when there was a internal problem creating field type
   */
  private async createFieldType(
    fieldTypeName: string,
    dataType: string,
  ): Promise<requestStatus> {
    const validFieldTypeName = this.validName('fieldTypes', fieldTypeName);
    if (validFieldTypeName === '') {
      return {
        statusCode: 400,
        message: `Input validation error: invalid field type name '${fieldTypeName}'`,
      };
    }
    try {
      await this.commands?.createCmd.createFieldType(
        validFieldTypeName,
        dataType,
      );
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 400, message: errorFunction(e) };
    }
  }

  /**
   * Creates a new link
   * @param cardKey Card key of the card where the link is created
   * @param destinationCardKey Card key of the destination card
   * @param linkType Name of the link type
   * @param linkDescription Description of the link
   * @returns request status
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when there was a internal problem creating linkType
   */
  private async createLink(
    cardKey: string,
    destinationCardKey: string,
    linkType: string,
    linkDescription: string,
  ): Promise<requestStatus> {
    try {
      await this.commands?.createCmd.createLink(
        cardKey,
        linkType,
        destinationCardKey,
        linkDescription,
      );
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 400, message: errorFunction(e) };
    }
  }

  /**
   * Creates a new link type.
   * @param name Name of the link type.
   * @returns request status
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   *  <br> statusCode 400 when there was a internal problem creating linkType
   */
  private async createLinkType(name: string): Promise<requestStatus> {
    const validLinkTypeName = this.validName('linkTypes', name);
    if (validLinkTypeName === '') {
      return {
        statusCode: 400,
        message: `Input validation error: invalid link type name '${name}'`,
      };
    }
    try {
      await this.commands?.createCmd.createLinkType(validLinkTypeName);
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 400, message: errorFunction(e) };
    }
  }

  /**
   * Creates a new project.
   * @param {string} path Project path
   * @param {string} prefix Card prefix
   * @param {string} projectName Project name
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   *  <br> statusCode 500 when there was a internal problem creating project
   */
  private async createProject(
    path: string,
    prefix: string,
    projectName: string,
  ): Promise<requestStatus> {
    path = resolveTilde(path);
    if (pathExists(path)) {
      return { statusCode: 400, message: `Project already exists '${path}'` };
    }
    if (!this.validateFolder(path)) {
      return {
        statusCode: 400,
        message: `Input validation error: folder name is invalid '${path}'`,
      };
    }
    if (prefix === undefined || prefix.length < 3 || prefix.length > 10) {
      return {
        statusCode: 400,
        message: `Input validation error: prefix must be from 3 to 10 characters long. '${prefix}' does not fulfill the condition.`,
      };
    }
    if (!this.validateNameResourceName(projectName)) {
      return {
        statusCode: 400,
        message: `Input validation error: invalid project name '${projectName}'`,
      };
    }
    if (!this.validatePrefix(prefix)) {
      return {
        statusCode: 400,
        message: `Input validation error: invalid prefix '${prefix}'`,
      };
    }
    try {
      await Create.createProject(path, prefix, projectName);
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 400, message: errorFunction(e) };
    }
  }

  /**
   * Creates a new template.
   * @param templateName template name to create
   * @param templateContent content for template
   * @returns request status
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   *  <br> statusCode 400 when there was a internal problem creating template
   */
  private async createTemplate(
    templateName: string,
    templateContent: string,
  ): Promise<requestStatus> {
    const validTemplateName = this.validName('templates', templateName);
    if (
      validTemplateName === '' ||
      !this.validateFolder(join(this.projectPath, templateName))
    ) {
      return {
        statusCode: 400,
        message: `Input validation error: template name is invalid '${templateName}'`,
      };
    }
    const content = templateContent
      ? (JSON.parse(templateContent) as TemplateMetadata)
      : DefaultContent.templateContent();
    // Note that templateContent is validated in createTemplate()
    try {
      await this.commands?.createCmd.createTemplate(validTemplateName, content);
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 400, message: errorFunction(e) };
    }
  }

  /**
   * Creates a new workflow to a project.
   * @param workflowName Workflow name.
   * @param workflowContent Workflow content as JSON. Must conform to workflowSchema.json
   * @returns request status
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   *  <br> statusCode 400 when there was a internal problem creating workflow
   */
  private async createWorkflow(
    workflowName: string,
    workflowContent: string,
  ): Promise<requestStatus> {
    const validWorkflowName = this.validName('workflows', workflowName);
    if (validWorkflowName === '') {
      return {
        statusCode: 400,
        message: `Input validation error: invalid workflow name '${workflowName}'`,
      };
    }
    const content = workflowContent
      ? (JSON.parse(workflowContent) as WorkflowMetadata)
      : DefaultContent.workflowContent(validWorkflowName);
    content.name = validWorkflowName;
    try {
      await this.commands?.createCmd.createWorkflow(content);
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 400, message: errorFunction(e) };
    }
  }

  /**
   * Creates a new report to a project.
   * @param name Report name.
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   *  <br> statusCode 500 when there was a internal problem creating report
   */
  private async createReport(name: string): Promise<requestStatus> {
    const validReportName = this.validName('reports', name);

    if (validReportName === '') {
      return {
        statusCode: 400,
        message: `Input validation error: invalid report name '${name}'`,
      };
    }
    try {
      await this.commands?.createCmd.createReport(name);
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 500, message: errorFunction(e) };
    }
  }

  /**
   * Open a card (.json and .adoc) for editing
   *
   * @param cardKey Card key of a card
   * @param options Optional parameters. If options.path is omitted, project path is assumed to be current path (or it one of its parents).
   * @returns
   */
  private async edit(
    cardKey: string,
    options?: CardsOptions,
  ): Promise<requestStatus> {
    let path = options?.projectPath;
    path = await this.setProjectPath(path);

    if (!this.validateFolder(path)) {
      return {
        statusCode: 400,
        message: `Input validation error: folder name is invalid '${path}'`,
      };
    }

    await this.commands?.editCmd.editCard(cardKey);
    return { statusCode: 200 };
  }

  /**
   * Exports whole or partial card tree to a given format.
   * @param {string} destination where cards are exported in the defined format
   * @param {string} parentCardKey parent card, if any. If undefined, whole project will be exported.
   * @param {string} mode export format (adoc, csv, html, pdf)
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   *  <br> statusCode 500 when there was a internal problem exporting
   */
  private async export(
    destination: string = 'output',
    parentCardKey?: string,
    mode?: string,
  ): Promise<requestStatus> {
    if (parentCardKey && !(await this.cardExists(parentCardKey))) {
      return {
        statusCode: 400,
        message: `Input validation error: cannot find card '${parentCardKey}'`,
      };
    }
    if (
      mode &&
      mode !== 'html' &&
      mode !== 'pdf' &&
      mode !== 'adoc' &&
      mode !== 'site'
    ) {
      return {
        statusCode: 400,
        message: `Input validation error: incorrect mode '${mode}'`,
      };
    }
    if (mode === 'adoc') {
      await this.commands?.exportCmd.exportToADoc(destination, parentCardKey);
    } else if (mode === 'html') {
      await this.commands?.exportCmd.exportToHTML(destination, parentCardKey);
    } else if (mode === 'site') {
      await this.commands?.exportSiteCmd.exportToSite(
        destination,
        parentCardKey,
      );
    } else {
      return {
        statusCode: 400,
        message: `Unknown mode '${mode}'`,
      };
    }
    return { statusCode: 200 };
  }

  /**
   * Imports another project to the 'destination' project as a module.
   * @param {string} source Path to project to import
   * @param {string} path Destination project path.
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   */
  private async import(
    source: string,
    destination: string,
  ): Promise<requestStatus> {
    if (!this.validateFolder(source)) {
      return {
        statusCode: 400,
        message: `Input validation error: folder name is invalid '${source}'`,
      };
    }
    if (!pathExists(source)) {
      return {
        statusCode: 400,
        message: `Input validation error: cannot find project '${source}'`,
      };
    }
    // todo: validate destination exists
    try {
      await this.commands?.importCmd.importProject(source, destination);
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 400, message: errorFunction(e) };
    }
  }

  /**
   * Imports cards from a CSV file to a project.
   * @param filePath path to the CSV file
   * @param parentCardKey parent card key, if any. If undefined, cards will be imported to root level.
   * @returns array of imported card keys wrapped in a requestStatus object or 400 if error
   */
  private async importCsv(
    filePath: string,
    parentCardKey: string,
  ): Promise<requestStatus> {
    try {
      return {
        statusCode: 200,
        payload: await this.commands?.importCmd.importCsv(
          filePath,
          parentCardKey,
        ),
      };
    } catch (e) {
      return {
        statusCode: 400,
        message: errorFunction(e),
      };
    }
  }

  /**
   * Removes a card (single card, or parent card and children), or an attachment.
   * @param {RemovableResourceTypes} type Type of resource to remove (attachment, card, template)
   * @param {string} targetName What will be removed. Either card-id or templateName
   * @param {string} args Additional detail of removal, such as attachment name
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when target was not removed.
   */
  private async remove(
    type: RemovableResourceTypes,
    targetName: string,
    args: string[],
  ): Promise<requestStatus> {
    if (!Commands.removableTypes.includes(type)) {
      return {
        statusCode: 400,
        message: `Input validation error: incorrect type '${type}'`,
      };
    }

    if (type === 'attachment' && args.length !== 1 && !args[0]) {
      return {
        statusCode: 400,
        message: `Input validation error: must pass argument 'detail' if requesting to remove attachment`,
      };
    }

    if (
      type === 'link' &&
      [2, 3].includes(args.length) &&
      !args[0] &&
      !args[1]
    ) {
      return {
        statusCode: 400,
        message: `Input validation error: must pass arguments 'cardKey' and 'linkType' if requesting to remove link`,
      };
    }
    try {
      await this.commands?.removeCmd.remove(type, targetName, ...args);
      return { statusCode: 200 };
    } catch (error) {
      return { statusCode: 400, message: errorFunction(error) };
    }
  }

  /**
   * Changes project prefix, and renames all project cards.
   * @param {string} to New project prefix
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   */
  private async rename(to: string): Promise<requestStatus> {
    if (!to) {
      throw new Error(`Input validation error: empty 'to' is not allowed`);
    }
    try {
      await this.commands?.renameCmd.rename(to);
      return { statusCode: 200 };
    } catch (error) {
      return { statusCode: 400, message: errorFunction(error) };
    }
  }

  /**
   * Shows wanted resources from a project / template.
   * @param {ResourceTypes} type type of resources to list
   * @param {string} typeDetail additional information about the resource (for example a card key for 'show card <cardKey>')
   * @param {CardsOptions} options Optional parameters. If options.path is omitted, project path is assumed to be current path (or it one of its parents).
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   */
  private async show(
    type: ResourceTypes,
    typeDetail: string,
    options: CardsOptions,
  ): Promise<requestStatus> {
    if (!this.allAllowedTypes().includes(type)) {
      return {
        statusCode: 400,
        message: `Input validation error: illegal type '${type}'`,
      };
    }
    if (
      !this.pluralizeTypes().includes(type) &&
      !typeDetail &&
      type !== 'project'
    ) {
      return {
        statusCode: 400,
        message: `Input validation error: must pass argument 'typeDetail' if requesting to show info on '${type}'`,
      };
    }
    const detail = typeDetail || '';
    let promise: Promise<
      | Card
      | CardAttachment[]
      | CardListContainer[]
      | CardType
      | FieldTypeDefinition
      | LinkType
      | ModuleSettings
      | ProjectMetadata
      | Template
      | WorkflowMetadata
      | string[]
      | undefined
    >;
    if (!this.commands) {
      throw new Error('No command manager');
    }

    switch (type) {
      case 'attachments':
        promise = this.commands?.showCmd.showAttachments();
        break;
      case 'card':
        {
          const cardDetails = {
            contentType: 'adoc',
            content: options?.details,
            metadata: true,
            children: options?.details,
            parent: options?.details,
            attachments: true,
          };
          promise = this.commands?.showCmd.showCardDetails(cardDetails, detail);
        }
        break;
      case 'cards':
        promise = this.commands?.showCmd.showCards();
        break;
      case 'cardType':
        promise = this.commands?.showCmd.showCardTypeDetails(detail);
        break;
      case 'cardTypes':
        promise = this.commands?.showCmd.showCardTypes();
        break;
      case 'fieldType':
        promise = this.commands?.showCmd.showFieldType(detail);
        break;
      case 'fieldTypes':
        promise = this.commands?.showCmd.showFieldTypes();
        break;
      case 'linkType':
        promise = this.commands?.showCmd.showLinkType(detail);
        break;
      case 'linkTypes':
        promise = this.commands?.showCmd.showLinkTypes();
        break;
      case 'module':
        promise = this.commands?.showCmd.showModule(detail);
        break;
      case 'modules':
        promise = this.commands?.showCmd.showModules();
        break;
      case 'project':
        promise = this.commands?.showCmd.showProject();
        break;
      case 'template':
        promise = this.commands?.showCmd.showTemplate(detail);
        break;
      case 'templates':
        promise = this.commands?.showCmd.showTemplates();
        break;
      case 'workflow':
        promise = this.commands?.showCmd.showWorkflow(detail);
        break;
      case 'workflows':
        promise = this.commands?.showCmd.showWorkflows();
        break;
      case 'reports':
        promise = this.commands?.showCmd.showReports();
        break;
      case 'attachment': // fallthrough - not implemented yet
      case 'link': // fallthrough - not implemented yet
      case 'links': // fallthrough - not implemented yet
      case 'report': // fallthrough - not implemented yet
      case 'projects': // fallthrough - not possible */
      default:
        return {
          statusCode: 400,
          message: `Unknown or not yet handled type ${type}`,
          payload: [],
        };
    }
    try {
      const result = await Promise.resolve(promise);
      return { statusCode: 200, payload: result };
    } catch (error) {
      return { statusCode: 400, message: errorFunction(error) };
    }
  }

  /**
   * Sets new state to a card.
   * @param {string} cardKey Cardkey of a card.
   * @param {string} stateName State to which the card should be set.
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   */
  private async transition(
    cardKey: string,
    stateName: string,
  ): Promise<requestStatus> {
    try {
      await this.commands?.transitionCmd.cardTransition(cardKey, {
        name: stateName,
      });
      return { statusCode: 200 };
    } catch (error) {
      return { statusCode: 400, message: errorFunction(error) };
    }
  }

  /**
   * Validates that a given path conforms to schema. Validates both file/folder structure and file content.
   * @param {string} path Optional, path to the project. If omitted, project is set from current path.
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   */
  private async validate(path: string): Promise<requestStatus> {
    try {
      const result = await this.validateCmd.validate(path);
      return {
        statusCode: 200,
        message: result.length ? result : 'Project structure validated',
      };
    } catch (error) {
      return { statusCode: 400, message: errorFunction(error) };
    }
  }

  /**
   * Starts the Cyberismo app by running npm start in the app project folder
   * @param {string} path Optional, path to the project. If omitted, project is set from current path.
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   *  <br> statusCode 500 when there was a internal problem validating schema
   */
  private async startApp(path?: string): Promise<requestStatus> {
    path = await this.setProjectPath(path);
    if (!this.validateFolder(path)) {
      return {
        statusCode: 400,
        message: `Input validation error: folder name is invalid '${path}'`,
      };
    }
    if (!pathExists(path)) {
      return {
        statusCode: 400,
        message: `Input validation error: cannot find project '${path}'`,
      };
    }

    console.log('Running Cyberismo app on http://localhost:3000/');
    console.log('Press Control+C to stop.');

    // __dirname when running cards ends with /tools/data-handler/dist - use that to navigate to app path
    const baseDir = dirname(fileURLToPath(import.meta.url));
    const appPath = resolve(baseDir, '../../app');

    // since current working directory changes, we need to resolve the project path
    const projectPath = resolve(path);

    const args = [`start`, `--project_path="${projectPath}"`];
    execFileSync(`npm`, args, {
      shell: true,
      cwd: `${appPath}`,
      stdio: 'inherit',
    });

    return { statusCode: 200 };
  }
}
