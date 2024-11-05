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
  constructor(private project: Project) {}

  /**
   * Shows all attachments (either template or project attachments) from a project.
   * @returns array of card attachments
   */
  public async showAttachments(): Promise<CardAttachment[]> {
    const attachments: CardAttachment[] = await this.project.attachments();
    const templateAttachments: CardAttachment[] = [];
    const templates = await this.project.templates();
    for (const template of templates) {
      const templateObject = await this.project.createTemplateObject(template);
      if (templateObject) {
        templateAttachments.push(...(await templateObject.attachments()));
      }
    }

    attachments.push(...templateAttachments);
    return attachments;
  }

  /**
   * Returns file buffer and mime type of an attachment. Used by app UI to download attachments.
   * @param {string} cardKey card key to find
   * @param {string} filename attachment filename
   * @returns attachment details
   */
  public async showAttachment(
    cardKey: string,
    filename: string,
  ): Promise<attachmentPayload> {
    if (!cardKey) {
      throw new Error(`Mandatory parameter 'cardKey' missing`);
    }

    const attachment = await this.getAttachment(cardKey, filename);

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
   * @param cardKey card key of the attachment
   * @param filename attachment filename
   * @param waitDelay amount of time to wait for the application to open the attachment
   */
  public async openAttachment(
    cardKey: string,
    filename: string,
    waitDelay: number = 1000,
  ) {
    const attachment = await this.getAttachment(cardKey, filename);

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

  //
  private async getAttachment(cardKey: string, filename: string) {
    const details = {
      content: false,
      metadata: true,
      children: false,
      parent: false,
      attachments: true,
    };
    const card = await this.project.cardDetailsById(cardKey, details);
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
   * @param {string} details card details to show
   * @param {string} cardKey card key to find
   * @returns card details object
   */
  public async showCardDetails(
    details: FetchCardDetails,
    cardKey?: string,
  ): Promise<Card> {
    if (!cardKey) {
      throw new Error(`Mandatory parameter 'cardKey' missing`);
    }
    const cardDetails = await this.project.cardDetailsById(cardKey, details);
    if (cardDetails === undefined) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }
    return cardDetails;
  }

  /**
   * Shows all cards (either template or project cards) from a project.
   * @returns cards list array
   */
  public async showCards(): Promise<CardListContainer[]> {
    const projectCards = await this.project.listAllCards(true);
    return projectCards;
  }

  /**
   * Returns all project cards in the project. Cards don't have content and nor metadata.
   * @note AppUi uses this method.
   * @returns array of cards
   */
  public async showProjectCards(): Promise<Card[]> {
    const projectCards = await this.project.showProjectCards();
    return projectCards;
  }

  /**
   * Shows details of a particular card type.
   * @param {string} cardTypeName card type name
   * @returns card type details
   */
  public async showCardTypeDetails(cardTypeName: string): Promise<CardType> {
    if (cardTypeName === '') {
      throw new Error(`Must define card type name to query its details.`);
    }
    const cardTypeDetails = await this.project.cardType(cardTypeName);
    if (cardTypeDetails === undefined) {
      throw new Error(
        `Card type '${cardTypeName}' not found from the project.`,
      );
    }
    return cardTypeDetails;
  }

  /**
   * Shows all card types in a project.
   * @returns array of card type names
   */
  public async showCardTypes(): Promise<string[]> {
    const cardTypes = (await this.project.cardTypes())
      .map((item) => item.name)
      .sort();
    return cardTypes;
  }

  /**
   * Shows all card types in a project.
   * @returns array of card type details
   */
  public async showCardTypesWithDetails(): Promise<(CardType | undefined)[]> {
    const promiseContainer = [];
    for (const cardType of await this.project.cardTypes()) {
      const cardTypeDetails = this.project.cardType(cardType.name);
      if (cardTypeDetails) {
        promiseContainer.push(cardTypeDetails);
      }
    }
    const results = await Promise.all(promiseContainer);
    return results.filter((item) => item);
  }

  /**
   * Shows all available link types.
   * @returns all available link types
   */
  public async showLinkTypes(): Promise<string[]> {
    const linkTypes = (await this.project.linkTypes())
      .map((item) => item.name.split('.').slice(0, -1).join('.'))
      .sort();
    return linkTypes;
  }

  /**
   * Shows details of a link type.
   * @param {string} linkTypeName name of a link type
   * @returns details of a link type.
   */
  public async showLinkType(
    linkTypeName: string,
  ): Promise<LinkType | undefined> {
    const linkTypeDetails = await this.project.linkType(linkTypeName);
    if (linkTypeDetails === undefined) {
      throw new Error(
        `Link type '${linkTypeName}' not found from the project.`,
      );
    }
    return linkTypeDetails;
  }

  /**
   * Shows all available field-types.
   * @returns all available field-types
   */
  public async showFieldTypes(): Promise<string[]> {
    // todo: make a common function that strips away the extension. Or use basename().
    const fieldTypes = (await this.project.fieldTypes())
      .map((item) => item.name.split('.').slice(0, -1).join('.'))
      .sort();
    return fieldTypes;
  }

  /**
   * Shows details of a field type.
   * @param {string} fieldTypeName name of a field type
   * @returns details of a field type.
   */
  public async showFieldType(
    fieldTypeName: string,
  ): Promise<FieldTypeDefinition | undefined> {
    const fieldTypeDetails = await this.project.fieldType(fieldTypeName);
    if (fieldTypeDetails === undefined) {
      throw new Error(
        `Field type '${fieldTypeName}' not found from the project.`,
      );
    }
    return fieldTypeDetails;
  }

  /**
   * Shows details of a module.
   * @param {string} moduleName name of a module
   * @returns details of a module.
   */
  public async showModule(moduleName: string): Promise<ModuleSettings> {
    const moduleDetails = await this.project.module(moduleName);
    if (!moduleDetails) {
      throw new Error(`Module '${moduleName}' does not exist in the project`);
    }
    return moduleDetails;
  }

  /**
   * Shows all modules (if any) in a project.
   * @returns all modules in a project.
   */
  public async showModules(): Promise<string[]> {
    const modules = (await this.project.modules())
      .map((item) => item.name)
      .sort();
    return modules;
  }

  /**
   * Shows all modules with full details in a project.
   * @returns all modules in a project.
   */
  public async showModulesWithDetails(): Promise<
    (ModuleSettings | undefined)[]
  > {
    const promiseContainer = [];
    for (const module of await this.project.modules()) {
      promiseContainer.push(this.project.module(module.name));
    }
    const results = await Promise.all(promiseContainer);
    return results.filter((item) => item);
  }

  /**
   * Shows details of a particular project.
   * @returns project information
   */
  public async showProject(): Promise<ProjectMetadata> {
    return this.project.show();
  }

  /**
   * Shows all reports in a project
   * @returns reports by their name
   */
  public async showReports(): Promise<string[]> {
    return (await this.project.reports()).map((item) => item.name).sort();
  }

  /**
   * Shows details of a particular template.
   * @param {string} templateName template name
   * @returns template details
   */
  public async showTemplate(templateName: string): Promise<Template> {
    const templateObject =
      await this.project.createTemplateObjectByName(templateName);
    if (!templateObject) {
      throw new Error(
        `Template '${templateName}' does not exist in the project`,
      );
    }
    return templateObject.show();
  }

  /**
   * Shows all templates in a project.
   * @returns templates array
   */
  public async showTemplates(): Promise<string[]> {
    const templates = (await this.project.templates())
      .map((item) => item.name)
      .sort();
    return templates;
  }

  /**
   * Shows all templates with full details in a project.
   * @param {string} projectPath path to a project
   * @returns all templates in a project.
   */
  public async showTemplatesWithDetails(): Promise<Template[]> {
    const promiseContainer = (await this.project.templates()).map((template) =>
      this.project
        .createTemplateObjectByName(template.name)
        .then((t) => t?.show()),
    );
    const result = await Promise.all(promiseContainer);
    return result.filter(Boolean) as Template[];
  }

  /**
   * Shows details of a particular workflow.
   * @param {string} workflowName name of workflow
   * @returns workflow details
   */
  public async showWorkflow(workflowName: string): Promise<WorkflowMetadata> {
    if (workflowName === '') {
      throw new Error(`Must define workflow name to query its details.`);
    }

    const workflowContent = await this.project.workflow(workflowName);
    if (workflowContent === undefined) {
      throw new Error(`Workflow '${workflowName}' not found from the project.`);
    }
    return workflowContent;
  }

  /**
   * Shows all workflows in a project.
   * @returns workflows
   */
  public async showWorkflows(): Promise<string[]> {
    const workflows = (await this.project.workflows())
      .map((item) => item.name)
      .sort();
    return workflows;
  }

  /**
   * Shows all workflows with full details in a project.
   * @returns workflows with full details
   */
  public async showWorkflowsWithDetails(): Promise<
    (WorkflowMetadata | undefined)[]
  > {
    const promiseContainer = [];
    for (const workflow of await this.project.workflows()) {
      promiseContainer.push(this.project.workflow(workflow.name));
    }
    const results = await Promise.all(promiseContainer);
    return results.filter((item) => item);
  }
}
