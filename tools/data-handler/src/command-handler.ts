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

import { Calculate } from './calculate.js';
import { Create } from './create.js';
import { Edit } from './edit.js';
import { ExportSite } from './export-site.js';
import { Import } from './import.js';
import { Move } from './move.js';
import { pathExists, resolveTilde, sepRegex } from './utils/file-utils.js';
import { Project } from './containers/project.js';
import { Remove } from './remove.js';
import { Rename } from './rename.js';
import { requestStatus } from './interfaces/request-status-interfaces.js';
import { Show } from './show.js';
import { Transition } from './transition.js';
import { Validate } from './validate.js';
import { fileURLToPath } from 'node:url';
import { errorFunction } from './utils/log-utils.js';
import {
  TemplateMetadata,
  WorkflowMetadata,
} from './interfaces/project-interfaces.js';

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

/**
 * Class that handles all commands.
 */
export class Commands {
  private calcCmd: Calculate;
  private createCmd: Create;
  private editCmd: Edit;
  private exportCmd: ExportSite;
  private importCmd: Import;
  private moveCmd: Move;
  private removeCmd: Remove;
  private renameCmd: Rename;
  private showCmd: Show;
  private transitionCmd: Transition;
  private validateCmd: Validate;

  private projectPath: string;

  constructor() {
    this.calcCmd = new Calculate();
    this.createCmd = new Create(this.calcCmd);
    this.editCmd = new Edit();
    this.exportCmd = new ExportSite();
    this.importCmd = new Import();
    this.moveCmd = new Move();
    this.removeCmd = new Remove(this.calcCmd);
    this.renameCmd = new Rename(this.calcCmd);
    this.showCmd = new Show();
    this.transitionCmd = new Transition(this.calcCmd);
    this.validateCmd = Validate.getInstance();
    this.projectPath = '';
  }

  public static allowedTypes = [
    'attachment',
    'card',
    'cardType',
    'fieldType',
    'linkType',
    'module',
    'project',
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
  private async cardExists(path: string, cardKey?: string): Promise<boolean> {
    if (cardKey) {
      const project = new Project(path);
      const card = await project.findSpecificCard(cardKey);
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

  // Validates a resource name.
  private validateName(name: string) {
    // Common names might have 'local' in the beginning before the actual name.
    const parts = name.split(sepRegex);

    if (parts.length > 3) {
      return false;
    }
    if (parts.length === 3) {
      name = parts[2];
    }

    const validName = new RegExp('^[A-Za-z ._-]+$');
    const contentValidated = validName.test(name);
    const lengthValidated = name.length > 0 && name.length < 256;
    return contentValidated && lengthValidated;
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
          return this.runLogicProgram(this.projectPath, cardKey);
        }
        if (command === 'generate') {
          return this.generateLogicProgram(this.projectPath, cardKey);
        }
      }
      if (command === Cmd.create) {
        const target = args.splice(0, 1)[0];
        if (target === 'attachment') {
          const [cardKey, attachment] = args;
          return this.createAttachment(cardKey, attachment, this.projectPath);
        }
        if (target === 'card') {
          const [template, parent] = args;
          return this.createCard(template, parent, this.projectPath);
        }
        if (target === 'cardType') {
          const [name, workflow] = args;
          return this.createCardType(name, workflow, this.projectPath);
        }
        if (target === 'project') {
          const [name, prefix] = args;
          this.projectPath = options.projectPath || ''; // todo: validation
          return this.createProject(this.projectPath, prefix, name); // todo: order of parameters
        }
        if (target === 'template') {
          const [name, content] = args;
          return this.createTemplate(name, content, this.projectPath);
        }
        if (target === 'fieldType') {
          const [name, datatype] = args;
          return this.createFieldType(name, datatype, this.projectPath);
        }
        if (target === 'link') {
          const [cardKey, linkType, destinationCardKey, linkDescription] = args;
          return this.createLink(
            cardKey,
            destinationCardKey,
            linkType,
            linkDescription,
            this.projectPath,
          );
        }
        if (target === 'linkType') {
          const [name] = args;
          return this.createLinkType(name, this.projectPath);
        }
        if (target === 'workflow') {
          const [name, content] = args;
          return this.createWorkflow(name, content, this.projectPath);
        }
      }
      if (command === Cmd.edit) {
        const [cardKey] = args;
        return this.edit(cardKey, options);
      }
      if (command === Cmd.export) {
        const [format, output, cardKey] = args;
        return this.export(output, this.projectPath, cardKey, format);
      }
      if (command === Cmd.import) {
        const target = args.splice(0, 1)[0];
        if (target === 'module') {
          const [source] = args;
          return this.import(source, this.projectPath);
        }
        if (target === 'csv') {
          const [csvFile, cardKey] = args;
          return this.importCsv(this.projectPath, csvFile, cardKey);
        }
      }
      if (command === Cmd.move) {
        const [source, destination] = args;
        try {
          await this.moveCmd.moveCard(this.projectPath, source, destination); //todo: order of parameters
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
              await this.moveCmd.rankFirst(this.projectPath, card);
            } else {
              await this.moveCmd.rankCard(this.projectPath, card, before);
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
              await this.moveCmd.rebalanceChildren(this.projectPath, cardKey);
            } else {
              await this.moveCmd.rebalanceProject(this.projectPath);
            }
            return { statusCode: 200 };
          } catch (e) {
            return { statusCode: 400, message: errorFunction(e) };
          }
        }
      }
      if (command === Cmd.remove) {
        const [type, target, ...rest] = args;
        return this.remove(type, target, rest, this.projectPath);
      }
      if (command === Cmd.rename) {
        const [to] = args;
        return this.rename(to, this.projectPath);
      }
      if (command === Cmd.show) {
        const [type, detail] = args;
        options.projectPath = this.projectPath;
        return this.show(type, detail, options);
      }
      if (command === Cmd.start) {
        return this.startApp(this.projectPath);
      }
      if (command === Cmd.transition) {
        const [cardKey, state] = args;
        return this.transition(cardKey, state, this.projectPath);
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
      const addedCards = await this.createCmd.addCards(
        path,
        cardTypeName,
        templateName,
        cardKey,
        repeat,
      );

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
   * @param projectPath Path to the project
   * @param filePath Path to the file
   * @returns
   */
  private async runLogicProgram(
    projectPath: string,
    filePath: string,
  ): Promise<requestStatus> {
    try {
      return {
        statusCode: 200,
        payload: await this.calcCmd.run(
          projectPath,
          join(process.cwd(), filePath),
        ),
      };
    } catch (e) {
      return { statusCode: 500, message: errorFunction(e) };
    }
  }

  /**
   * Generates logic program for a card.
   * @param projectPath Optional, path to the project. If omitted, project is set from current path.
   * @param cardKey optional, if defined, logic program is generated for the subtree of the card
   * @returns statusCode 200 when operation succeeded
   * <br> statusCode 500 when there was a internal problem generating logic program
   */
  private async generateLogicProgram(
    projectPath?: string,
    cardKey?: string,
  ): Promise<requestStatus> {
    try {
      await this.calcCmd.generate(projectPath || '', cardKey);
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 500, message: errorFunction(e) };
    }
  }

  /**
   * Adds attachment to a card.
   * @param {string} cardKey card key
   * @param {string} attachment path to attachment
   * @param {string} path Optional, path to the project. If omitted, project is set from current path.
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   *  <br> statusCode 500 when there was a internal problem creating attachment
   */
  private async createAttachment(
    cardKey: string,
    attachment: string,
    path: string,
  ): Promise<requestStatus> {
    if (!pathExists(attachment)) {
      return {
        statusCode: 400,
        message: `Input validation error: cannot find attachment '${attachment}'`,
      };
    }
    try {
      await this.createCmd.createAttachment(cardKey, path, attachment);
    } catch (e) {
      return { statusCode: 400, message: errorFunction(e) };
    }
    return { statusCode: 200 };
  }

  /**
   * Creates a new card to a project, or to a template.
   * @param {string} templateName which template to use
   * @param {string} parentCardKey parent for the new card
   * @param {string} path Optional, path to the project. If omitted, project is set from current path.
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   */
  private async createCard(
    templateName: string,
    parentCardKey: string,
    path: string,
  ): Promise<requestStatus> {
    if (parentCardKey === undefined) {
      parentCardKey = '';
    }
    try {
      const createdCards = await this.createCmd.createCard(
        path,
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
   * @param {string} cardTypeName Name of the card type.
   * @param {string} workflowName Name of the workflow that the card type uses.
   * @param {string} path Optional, path to the project. If omitted, project is set from current path.
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   *  <br> statusCode 500 when there was a internal problem creating card type
   */
  private async createCardType(
    cardTypeName: string,
    workflowName: string,
    path: string,
  ): Promise<requestStatus> {
    if (!this.validateName(cardTypeName)) {
      return {
        statusCode: 400,
        message: `Input validation error: invalid card type name '${cardTypeName}'`,
      };
    }
    if (!this.validateName(workflowName)) {
      return {
        statusCode: 400,
        message: `Input validation error: invalid workflow name '${workflowName}'`,
      };
    }
    try {
      await this.createCmd.createCardType(path, cardTypeName, workflowName);
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 400, message: errorFunction(e) };
    }
  }

  /**
   * Creates a new field type.
   * @param {string} fieldTypeName Name of the field type.
   * * @param {string} dataType Name of the field type.
   * @param {string} path Optional, path to the project. If omitted, project is set from current path.
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   *  <br> statusCode 500 when there was a internal problem creating field type
   */
  private async createFieldType(
    fieldTypeName: string,
    dataType: string,
    path: string,
  ): Promise<requestStatus> {
    if (!this.validateName(fieldTypeName)) {
      return {
        statusCode: 400,
        message: `Input validation error: invalid field type name '${fieldTypeName}'`,
      };
    }
    try {
      await this.createCmd.createFieldType(path, fieldTypeName, dataType);
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
   * @param path Optional, path to the project. If omitted, project is set from current path.
   */
  private async createLink(
    cardKey: string,
    destinationCardKey: string,
    linkType: string,
    linkDescription: string,
    path: string,
  ): Promise<requestStatus> {
    try {
      await this.createCmd.createLink(
        path,
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
   * @param path Optional, path to the project. If omitted, project is set from current path.
   */
  private async createLinkType(
    name: string,
    path: string,
  ): Promise<requestStatus> {
    if (!this.validateName(name)) {
      return {
        statusCode: 400,
        message: `Input validation error: invalid link type name '${name}'`,
      };
    }
    try {
      await this.createCmd.createLinkType(path, name);
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
    if (!this.validateName(projectName)) {
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
      await this.createCmd.createProject(path, prefix, projectName);
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 400, message: errorFunction(e) };
    }
  }

  /**
   * Creates a new template.
   * @param {string} templateName template name to create
   * @param {string} templateContent content for template
   * @param {string} path Optional, path to the project. If omitted, project is set from current path.
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   *  <br> statusCode 500 when there was a internal problem creating template
   */
  private async createTemplate(
    templateName: string,
    templateContent: string,
    path: string,
  ): Promise<requestStatus> {
    if (
      !this.validateName(templateName) ||
      !this.validateFolder(join(path, templateName))
    ) {
      return {
        statusCode: 400,
        message: `Input validation error: template name is invalid '${templateName}'`,
      };
    }
    const content = templateContent
      ? (JSON.parse(templateContent) as TemplateMetadata)
      : Create.defaultTemplateContent();
    // Note that templateContent is validated in createTemplate()
    try {
      await this.createCmd.createTemplate(path, templateName, content);
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 400, message: errorFunction(e) };
    }
  }

  /**
   * Creates a new workflow to a project.
   * @param {string} workflowName Workflow name.
   * @param {string} workflowContent Workflow content as JSON. Must conform to workflowSchema.json
   * @param {string} path Optional, path to the project. If omitted, project is set from current path.
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   *  <br> statusCode 500 when there was a internal problem creating workflow
   */
  private async createWorkflow(
    workflowName: string,
    workflowContent: string,
    path: string,
  ): Promise<requestStatus> {
    if (!this.validateName(workflowName)) {
      return {
        statusCode: 400,
        message: `Input validation error: invalid workflow name '${workflowName}'`,
      };
    }
    const content = workflowContent
      ? (JSON.parse(workflowContent) as WorkflowMetadata)
      : Create.defaultWorkflowContent(workflowName);
    // Note that workflowContent is validated in the createWorkflow function.
    try {
      await this.createCmd.createWorkflow(path, content);
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 400, message: errorFunction(e) };
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

    await this.editCmd.editCard(path, cardKey);
    return { statusCode: 200 };
  }

  /**
   * Exports whole or partial card tree to a given format.
   * @param {string} destination where cards are exported in the defined format
   * @param {string} source from which directory card content is used
   * @param {string} parentCardKey parent card, if any. If undefined, whole project will be exported.
   * @param {string} mode export format (adoc, csv, html, pdf)
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   *  <br> statusCode 500 when there was a internal problem exporting
   */
  private async export(
    destination: string = 'output',
    source: string,
    parentCardKey?: string,
    mode?: string,
  ): Promise<requestStatus> {
    if (parentCardKey && !(await this.cardExists(source, parentCardKey))) {
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
      await this.exportCmd.exportToADoc(source, destination, parentCardKey);
    } else if (mode === 'html') {
      await this.exportCmd.exportToHTML(source, destination, parentCardKey);
    } else if (mode === 'site') {
      await this.exportCmd.exportToSite(source, destination, parentCardKey);
    } else {
      return {
        statusCode: 400,
        message: `Unknown mode '${mode}'`,
      };
    }
    return { statusCode: 200 };
  }

  /**
   * Imports another project to the 'path' project as a module.
   * @param {string} source Path to project to import
   * @param {string} path Optional. Destination project path. If omitted, destination project is set from current path.
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   */
  private async import(source: string, path: string): Promise<requestStatus> {
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
    try {
      await this.importCmd.importProject(source, path);
      return { statusCode: 200 };
    } catch (e) {
      return { statusCode: 400, message: errorFunction(e) };
    }
  }

  /**
   * Imports cards from a CSV file to a project.
   * @param path path of the project
   * @param filePath path to the CSV file
   * @param parentCardKey parent card key, if any. If undefined, cards will be imported to root level.
   * @returns array of imported card keys wrapped in a requestStatus object or 400 if error
   */
  private async importCsv(
    path: string,
    filePath: string,
    parentCardKey: string,
  ): Promise<requestStatus> {
    try {
      return {
        statusCode: 200,
        payload: await this.importCmd.importCsv(path, filePath, parentCardKey),
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
   * @param {string} type Type of resource to remove (attachment, card, template)
   * @param {string} targetName What will be removed. Either card-id or templateName
   * @param {string} args Additional detail of removal, such as attachment name
   * @param {string} path Path to the project. If omitted, project is set from current path.
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when target was not removed.
   */
  private async remove(
    type: string,
    targetName: string,
    args: string[],
    path: string,
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
      await this.removeCmd.remove(path, type, targetName, ...args);
      return { statusCode: 200 };
    } catch (error) {
      return { statusCode: 400, message: errorFunction(error) };
    }
  }

  /**
   * Changes project prefix, and renames all project cards.
   * @param {string} to New project prefix
   * @param {string} path Optional. Path to the project. If omitted, project is set from current path.
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   */
  private async rename(to: string, path: string): Promise<requestStatus> {
    if (!to) {
      throw new Error(`Input validation error: empty 'to' is not allowed`);
    }
    try {
      await this.renameCmd.rename(path, to);
      return { statusCode: 200 };
    } catch (error) {
      return { statusCode: 400, message: errorFunction(error) };
    }
  }

  /**
   * Shows wanted resources from a project / template.
   * @param {string} type type of resources to list
   * @param {string} typeDetail additional information about the resource (for example a card key for 'show card <cardKey>')
   * @param {CardsOptions} options Optional parameters. If options.path is omitted, project path is assumed to be current path (or it one of its parents).
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   */
  private async show(
    type: string,
    typeDetail: string,
    options: CardsOptions,
  ): Promise<requestStatus> {
    const path = options.projectPath || this.projectPath;
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

    let functionToCall: Function = async () => {}; // eslint-disable-line @typescript-eslint/no-unsafe-function-type
    const parameters = [];

    switch (type) {
      case 'attachments':
        parameters.push(path);
        functionToCall = this.showCmd.showAttachments.bind(this);
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
          parameters.push(path, cardDetails, detail);
          functionToCall = this.showCmd.showCardDetails.bind(this);
        }
        break;
      case 'cards':
        parameters.push(path);
        functionToCall = this.showCmd.showCards.bind(this);
        break;
      case 'cardType':
        parameters.push(path, detail);
        functionToCall = this.showCmd.showCardTypeDetails.bind(this);
        break;
      case 'cardTypes':
        parameters.push(path);
        functionToCall = this.showCmd.showCardTypes.bind(this);
        break;
      case 'fieldType':
        parameters.push(path, detail);
        functionToCall = this.showCmd.showFieldType.bind(this);
        break;
      case 'fieldTypes':
        parameters.push(path);
        functionToCall = this.showCmd.showFieldTypes.bind(this);
        break;
      case 'linkType':
        parameters.push(path, detail);
        functionToCall = this.showCmd.showLinkType.bind(this);
        break;
      case 'linkTypes':
        parameters.push(path);
        functionToCall = this.showCmd.showLinkTypes.bind(this);
        break;
      case 'module':
        parameters.push(path, detail);
        functionToCall = this.showCmd.showModule.bind(this);
        break;
      case 'modules':
        parameters.push(path);
        functionToCall = this.showCmd.showModules.bind(this);
        break;
      case 'project':
        parameters.push(path);
        functionToCall = this.showCmd.showProject.bind(this);
        break;
      case 'template':
        parameters.push(path, detail);
        functionToCall = this.showCmd.showTemplate.bind(this);
        break;
      case 'templates':
        parameters.push(path);
        functionToCall = this.showCmd.showTemplates.bind(this);
        break;
      case 'workflow':
        parameters.push(path, detail);
        functionToCall = this.showCmd.showWorkflow.bind(this);
        break;
      case 'workflows':
        parameters.push(path);
        functionToCall = this.showCmd.showWorkflows.bind(this);
        break;
      case 'attachment': // fallthrough - not implemented yet
      case 'link': // fallthrough - not implemented yet
      case 'links': // fallthrough - not implemented yet
      case 'projects': // fallthrough - not possible */
      default:
        return {
          statusCode: 400,
          message: `Unknown or not yet handled type ${type}`,
          payload: [],
        };
    }
    try {
      const result = await functionToCall(...parameters);
      return { statusCode: 200, payload: result };
    } catch (error) {
      return { statusCode: 400, message: errorFunction(error) };
    }
  }

  /**
   * Sets new state to a card.
   * @param {string} cardKey Cardkey of a card.
   * @param {string} stateName State to which the card should be set.
   * @param {string} path Optional, path to the project. If omitted, project is set from current path.
   * @returns {requestStatus}
   *       statusCode 200 when operation succeeded
   *  <br> statusCode 400 when input validation failed
   */
  private async transition(
    cardKey: string,
    stateName: string,
    path: string,
  ): Promise<requestStatus> {
    try {
      await this.transitionCmd.cardTransition(path, cardKey, {
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

    // __dirname when running cards ends with /tools/data-handler/dist - use that to navigate to app path
    const baseDir = dirname(fileURLToPath(import.meta.url));
    const appPath = resolve(baseDir, '../../app');

    // since current working directory changes, we need to resolve the project path
    const projectPath = resolve(path);

    // Start trying from port 3000 and increase the port number if the port is already in use
    let port = 3000;
    let args = [
      '-s',
      `start`,
      `--project_path="${projectPath}"`,
      '--',
      `--port ${port}`,
    ];

    while (port < 3099) {
      try {
        console.log(
          `Starting Cyberismo on http://localhost:${port}. Enter CTRL+C to quit.`,
        );
        execFileSync(`npm`, args, { shell: true, cwd: `${appPath}` });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        port++;
        args = [
          `start`,
          `--project_path="${projectPath}"`,
          '--',
          `--port ${port}`,
        ];
      }
    }

    return { statusCode: 200 };
  }
}
