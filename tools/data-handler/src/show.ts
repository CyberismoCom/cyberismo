/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { existsSync, readFileSync } from 'node:fs';
import mime from 'mime-types';

// cyberismo
import { attachmentPayload } from './interfaces/request-status-interfaces.js';
import {
  CardAttachment,
  Card,
  CardListContainer,
  CardType,
  FetchCardDetails,
  FieldTypeDefinition,
  LinkType,
  ModuleSettings,
  ProjectMetadata,
  Template,
  WorkflowMetadata,
} from './interfaces/project-interfaces.js';
import { Project } from './containers/project.js';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { UserPreferences } from './utils/user-preferences.js';
import { homedir } from 'node:os';

export class Show {
  static project: Project;

  /**
   * Shows all attachments (either template or project attachments) from a project.
   * @param {string} projectPath path to a project
   * @returns array of card attachments
   */
  public async showAttachments(projectPath: string): Promise<CardAttachment[]> {
    Show.project = new Project(projectPath);
    const attachments: CardAttachment[] = await Show.project.attachments();
    const templateAttachments: CardAttachment[] = [];
    const templates = await Show.project.templates();
    for (const template of templates) {
      const templateObject = await Show.project.createTemplateObject(template);
      if (templateObject) {
        templateAttachments.push(...(await templateObject.attachments()));
      }
    }

    attachments.push(...templateAttachments);
    return attachments;
  }

  /**
   * Returns file buffer and mime type of an attachment. Used by app UI to download attachments.
   * @param {string} projectPath path to a project
   * @param {string} cardKey card key to find
   * @param {string} filename attachment filename
   * @returns attachment details
   */
  public async showAttachment(
    projectPath: string,
    cardKey: string,
    filename: string,
  ): Promise<attachmentPayload> {
    if (!cardKey) {
      throw new Error(`Mandatory parameter 'cardKey' missing`);
    }

    const attachment = await this.getAttachment(projectPath, cardKey, filename);

    let attachmentPath: string = '';
    if (attachment) {
      attachmentPath = `${attachment.path}/${attachment.fileName}`;
    }

    if (!attachment || !existsSync(attachmentPath)) {
      throw new Error(`Attachment '${filename}' not found for card ${cardKey}`);
    } else {
      const fileBuffer = readFileSync(attachmentPath);
      let mimeType = mime.lookup(attachmentPath);
      if (mimeType === false) {
        mimeType = 'application/octet-stream';
      }
      const payload: attachmentPayload = { fileBuffer, mimeType };
      return payload;
    }
  }

  /**
   * Opens an attachment using a configured application or the operating system's default application.
   * @param projectPath path to the project
   * @param cardKey card key of the attachment
   * @param filename attachment filename
   * @param waitDelay amount of time to wait for the application to open the attachment
   */
  public async openAttachment(
    projectPath: string,
    cardKey: string,
    filename: string,
    waitDelay: number = 1000,
  ) {
    const attachment = await this.getAttachment(projectPath, cardKey, filename);

    if (!attachment) {
      throw new Error(`Attachment '${filename}' not found for card ${cardKey}`);
    }

    // Try to open the attachment using a configured application if one exists

    const prefs = new UserPreferences(
      join(homedir(), '.cyberismo', 'cards.prefs.json'),
    ).getPreferences();
    const attachmentEditors =
      prefs.attachmentEditors && process.platform in prefs.attachmentEditors
        ? prefs.attachmentEditors[process.platform]
        : [];

    const editor = attachmentEditors.find(
      (editor) => editor.mimeType === attachment.mimeType,
    );

    const path = resolve(attachment.path, attachment.fileName);

    if (!editor) {
      this.openUsingDefaultApplication(path);
      return;
    }

    // We can safely assume that the editor command is safe to execute, since it is defined in the preferences file by the user
    const processHandle = spawn(
      editor.command.replace('{{attachmentPath}}', path),
      [],
      {
        shell: true,
      },
    );

    // wait for the application to open the attachment
    await new Promise((resolve) => setTimeout(resolve, waitDelay));

    // If the application exists with a non-zero exit code, open the attachment using the operating system's default application
    if (processHandle.exitCode !== 0 && processHandle.exitCode !== null) {
      this.openUsingDefaultApplication(path);
    }
  }

  private async getAttachment(
    projectPath: string,
    cardKey: string,
    filename: string,
  ) {
    Show.project = new Project(projectPath);
    const details = {
      content: false,
      metadata: true,
      children: false,
      parent: false,
      attachments: true,
    };
    const card = await Show.project.cardDetailsById(cardKey, details);
    if (card === undefined) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }

    const attachment =
      card.attachments?.find((a) => a.fileName === filename) ?? undefined;
    return attachment;
  }

  /**
   * Opens the given path using the operating system's default application.
   * Doesn't block the main thread.
   * @param path path to a file
   */
  private openUsingDefaultApplication(path: string) {
    if (process.platform === 'win32') {
      // This is a workaround to get windows to open the file in foreground
      spawn(`start`, ['cmd.exe', '/c', 'start', '""', `"${path}"`], {
        shell: true,
      });
    } else if (process.platform === 'darwin') {
      spawn('open', [path]);
    } else {
      spawn('xdg-open', [path]);
    }
  }

  /**
   * Shows details of a particular card (template card, or project card)
   * @note Note that parameter 'cardKey' is optional due to technical limitations of class calling this class. It must be defined to get valid results.
   * @param {string} projectPath path to a project
   * @param {string} details card details to show
   * @param {string} cardKey card key to find
   * @returns card details object
   */
  public async showCardDetails(
    projectPath: string,
    details: FetchCardDetails,
    cardKey?: string,
  ): Promise<Card> {
    if (!cardKey) {
      throw new Error(`Mandatory parameter 'cardKey' missing`);
    }
    Show.project = new Project(projectPath);
    const cardDetails = await Show.project.cardDetailsById(cardKey, details);
    if (cardDetails === undefined) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }
    return cardDetails;
  }

  /**
   * Shows all cards (either template or project cards) from a project.
   * @param {string} projectPath path to a project
   * @returns cards list array
   */
  public async showCards(projectPath: string): Promise<CardListContainer[]> {
    Show.project = new Project(projectPath);
    const projectCards = await Show.project.listAllCards(true);
    return projectCards;
  }

  /**
   * Returns all project cards in the project. Cards don't have content and nor metadata.
   * @param projectPath path to a project
   * @note AppUi uses this method.
   * @returns array of cards
   */
  public async showProjectCards(projectPath: string): Promise<Card[]> {
    Show.project = new Project(projectPath);
    const projectCards = await Show.project.showProjectCards();
    return projectCards;
  }

  /**
   * Shows details of a particular card type.
   * @param {string} projectPath path to a project
   * @param {string} cardTypeName card type name
   * @returns card type details
   */
  public async showCardTypeDetails(
    projectPath: string,
    cardTypeName: string,
  ): Promise<CardType> {
    Show.project = new Project(projectPath);
    if (cardTypeName === '') {
      throw new Error(`Must define card type name to query its details.`);
    }
    const cardTypeDetails = await Show.project.cardType(cardTypeName);
    if (cardTypeDetails === undefined) {
      throw new Error(
        `Card type '${cardTypeName}' not found from the project.`,
      );
    }
    return cardTypeDetails;
  }

  /**
   * Shows all card types in a project.
   * @param {string} projectPath path to a project
   * @returns array of card type names
   */
  public async showCardTypes(projectPath: string): Promise<string[]> {
    Show.project = new Project(projectPath);
    const cardTypes = (await Show.project.cardTypes())
      .map((item) => item.name)
      .sort();
    return cardTypes;
  }

  /**
   * Shows all card types in a project.
   * @param {string} projectPath path to a project
   * @returns array of card type details
   */
  public async showCardTypesWithDetails(
    projectPath: string,
  ): Promise<(CardType | undefined)[]> {
    Show.project = new Project(projectPath);
    const promiseContainer = [];
    for (const cardType of await Show.project.cardTypes()) {
      const cardTypeDetails = Show.project.cardType(cardType.name);
      if (cardTypeDetails) {
        promiseContainer.push(cardTypeDetails);
      }
    }
    const results = await Promise.all(promiseContainer);
    return results.filter((item) => item);
  }

  /**
   * Shows all available link types.
   * @param {string} projectPath path to a project
   * @returns all available link types
   */
  public async showLinkTypes(projectPath: string): Promise<string[]> {
    Show.project = new Project(projectPath);
    const linkTypes = (await Show.project.linkTypes())
      .map((item) => item.name.split('.').slice(0, -1).join('.'))
      .sort();
    return linkTypes;
  }

  /**
   * Shows details of a link type.
   * @param {string} projectPath path to a project
   * @param {string} linkTypeName name of a link type
   * @returns details of a link type.
   */
  public async showLinkType(
    projectPath: string,
    linkTypeName: string,
  ): Promise<LinkType | undefined> {
    Show.project = new Project(projectPath);
    const linkTypeDetails = await Show.project.linkType(linkTypeName);
    if (linkTypeDetails === undefined) {
      throw new Error(
        `Link type '${linkTypeName}' not found from the project.`,
      );
    }
    return linkTypeDetails;
  }

  /**
   * Shows all available field-types.
   * @param {string} projectPath path to a project
   * @returns all available field-types
   */
  public async showFieldTypes(projectPath: string): Promise<string[]> {
    Show.project = new Project(projectPath);
    const fieldTypes = (await Show.project.fieldTypes())
      .map((item) => item.name.split('.').slice(0, -1).join('.'))
      .sort();
    return fieldTypes;
  }

  /**
   * Shows details of a field type.
   * @param {string} projectPath path to a project
   * @param {string} fieldTypeName name of a field type
   * @returns details of a field type.
   */
  public async showFieldType(
    projectPath: string,
    fieldTypeName: string,
  ): Promise<FieldTypeDefinition | undefined> {
    Show.project = new Project(projectPath);
    const fieldTypeDetails = await Show.project.fieldType(fieldTypeName);
    if (fieldTypeDetails === undefined) {
      throw new Error(
        `Field type '${fieldTypeName}' not found from the project.`,
      );
    }
    return fieldTypeDetails;
  }

  /**
   * Shows details of a module.
   * @param {string} projectPath path to a project
   * @param {string} moduleName name of a module
   * @returns details of a module.
   */
  public async showModule(
    projectPath: string,
    moduleName: string,
  ): Promise<ModuleSettings> {
    Show.project = new Project(projectPath);
    const moduleDetails = await Show.project.module(moduleName);
    if (!moduleDetails) {
      throw new Error(`Module '${moduleName}' does not exist in the project`);
    }
    return moduleDetails;
  }

  /**
   * Shows all modules (if any) in a project.
   * @param {string} projectPath path to a project
   * @returns all modules in a project.
   */
  public async showModules(projectPath: string): Promise<string[]> {
    Show.project = new Project(projectPath);
    const modules = (await Show.project.modules())
      .map((item) => item.name)
      .sort();
    return modules;
  }

  /**
   * Shows all modules with full details in a project.
   * @param {string} projectPath path to a project
   * @returns all modules in a project.
   */
  public async showModulesWithDetails(
    projectPath: string,
  ): Promise<(ModuleSettings | undefined)[]> {
    Show.project = new Project(projectPath);
    const promiseContainer = [];
    for (const module of await Show.project.modules()) {
      promiseContainer.push(Show.project.module(module.name));
    }
    const results = await Promise.all(promiseContainer);
    return results.filter((item) => item);
  }

  /**
   * Shows details of a particular project.
   * @param {string} projectPath path to a project
   * @returns project information
   */
  public async showProject(projectPath: string): Promise<ProjectMetadata> {
    Show.project = new Project(projectPath);
    return Show.project.show();
  }

  /**
   * Shows details of a particular template.
   * @param {string} projectPath path to a project
   * @param {string} templateName template name
   * @returns template details
   */
  public async showTemplate(
    projectPath: string,
    templateName: string,
  ): Promise<Template> {
    Show.project = new Project(projectPath);
    const templateObject =
      await Show.project.createTemplateObjectByName(templateName);
    if (!templateObject) {
      throw new Error(
        `Template '${templateName}' does not exist in the project`,
      );
    }
    return templateObject.show();
  }

  /**
   * Shows all templates in a project.
   * @param {string} projectPath path to a project
   * @returns templates array
   */
  public async showTemplates(projectPath: string): Promise<string[]> {
    Show.project = new Project(projectPath);
    const templates = (await Show.project.templates())
      .map((item) => item.name)
      .sort();
    return templates;
  }

  /**
   * Shows all templates with full details in a project.
   * @param {string} projectPath path to a project
   * @returns all templates in a project.
   */
  public async showTemplatesWithDetails(
    projectPath: string,
  ): Promise<Template[]> {
    Show.project = new Project(projectPath);
    const promiseContainer = (await Show.project.templates()).map((template) =>
      Show.project
        .createTemplateObjectByName(template.name)
        .then((t) => t?.show()),
    );
    const result = await Promise.all(promiseContainer);
    return result.filter(Boolean) as Template[];
  }

  /**
   * Shows details of a particular workflow.
   * @param {string} projectPath path to a project
   * @param {string} workflowName name of workflow
   * @returns workflow details
   */
  public async showWorkflow(
    projectPath: string,
    workflowName: string,
  ): Promise<WorkflowMetadata> {
    Show.project = new Project(projectPath);
    if (workflowName === '') {
      throw new Error(`Must define workflow name to query its details.`);
    }
    const workflowContent = await Show.project.workflow(workflowName);
    if (workflowContent === undefined) {
      throw new Error(`Workflow '${workflowName}' not found from the project.`);
    }
    return workflowContent;
  }

  /**
   * Shows all workflows in a project.
   * @param {string} projectPath path to a project
   * @returns workflows
   */
  public async showWorkflows(projectPath: string): Promise<string[]> {
    Show.project = new Project(projectPath);
    const workflows = (await Show.project.workflows())
      .map((item) => item.name)
      .sort();
    return workflows;
  }

  /**
   * Shows all workflows with full details in a project.
   * @param {string} projectPath path to a project
   * @returns workflows with full details
   */
  public async showWorkflowsWithDetails(
    projectPath: string,
  ): Promise<(WorkflowMetadata | undefined)[]> {
    const promiseContainer = [];
    Show.project = new Project(projectPath);
    for (const workflow of await Show.project.workflows()) {
      promiseContainer.push(Show.project.workflow(workflow.name));
    }
    const results = await Promise.all(promiseContainer);
    return results.filter((item) => item);
  }
}
