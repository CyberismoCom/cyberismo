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
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

import mime from 'mime-types';

// cyberismo
import { attachmentPayload } from './interfaces/request-status-interfaces.js';
import {
  CardAttachment,
  Card,
  CardListContainer,
  FetchCardDetails,
  ModuleSettings,
  ProjectMetadata,
  TemplateConfiguration,
} from './interfaces/project-interfaces.js';
import {
  CardType,
  FieldType,
  LinkType,
  Workflow,
} from './interfaces/resource-interfaces.js';
import { stripExtension } from './utils/file-utils.js';
import { Project } from './containers/project.js';
import { UserPreferences } from './utils/user-preferences.js';

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
   * @param cardKey card key to find
   * @param filename attachment filename
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
   * @todo: Move away from Show.
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

  // Returns attachment details
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

  // Opens the given path using the operating system's default application. Doesn't block the main thread.
  // @todo: Move away from Show.
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
   * @param details card details to show
   * @param cardKey card key to find
   * @returns card details
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
   * @param cardTypeName card type name
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
   * @returns sorted array of card types
   */
  public async showCardTypes(): Promise<string[]> {
    return (await this.project.cardTypes())
      .map((item) => stripExtension(item.name))
      .sort();
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

  private collectLabels = (cards: Card[]): string[] => {
    return cards.reduce<string[]>((labels, card) => {
      // Add the labels from the current card
      if (card.metadata?.labels) {
        labels.push(...card.metadata.labels);
      }
      // Recursively collect labels from subcards, if they exist
      if (card.children) {
        labels.push(...this.collectLabels(card.children));
      }
      return labels;
    }, []);
  };

  public async showLabels(): Promise<string[]> {
    const cards = await this.project.showProjectCards();

    const labels = this.collectLabels(cards);

    return Array.from(new Set(labels));
  }

  /**
   * Shows all available link types.
   * @returns sorted array of link types
   */
  public async showLinkTypes(): Promise<string[]> {
    return (await this.project.linkTypes())
      .map((item) => stripExtension(item.name))
      .sort();
  }

  /**
   * Shows details of a link type.
   * @param linkTypeName name of a link type
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
   * Shows all available field types.
   * @returns sorted array of field types
   */
  public async showFieldTypes(): Promise<string[]> {
    return (await this.project.fieldTypes())
      .map((item) => stripExtension(item.name))
      .sort();
  }

  /**
   * Shows details of a field type.
   * @param fieldTypeName name of a field type
   * @returns details of a field type.
   */
  public async showFieldType(
    fieldTypeName: string,
  ): Promise<FieldType | undefined> {
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
   * @param moduleName name of a module
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
    return (await this.project.modules()).map((item) => item.name).sort();
  }

  /**
   * Shows all modules with full details in a project.
   * @returns all modules with full details in a project.
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
   * @returns sorted array of reports
   */
  public async showReports(): Promise<string[]> {
    return (await this.project.reports()).map((item) => item.name).sort();
  }

  /**
   * Shows details of a particular template.
   * @param templateName template name
   * @returns template details
   */
  public async showTemplate(
    templateName: string,
  ): Promise<TemplateConfiguration> {
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
   * @returns sorted array of templates
   */
  public async showTemplates(): Promise<string[]> {
    return (await this.project.templates()).map((item) => item.name).sort();
  }

  /**
   * Shows all templates with full details in a project.
   * @returns all templates in a project.
   */
  public async showTemplatesWithDetails(): Promise<TemplateConfiguration[]> {
    const promiseContainer = (await this.project.templates()).map((template) =>
      this.project
        .createTemplateObjectByName(template.name)
        .then((t) => t?.show()),
    );
    const result = await Promise.all(promiseContainer);
    return result.filter(Boolean) as TemplateConfiguration[];
  }

  /**
   * Shows details of a particular workflow.
   * @param workflowName name of workflow
   * @returns workflow details
   */
  public async showWorkflow(workflowName: string): Promise<Workflow> {
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
   * @returns sorted array of workflows
   */
  public async showWorkflows(): Promise<string[]> {
    return (await this.project.workflows())
      .map((item) => stripExtension(item.name))
      .sort();
  }

  /**
   * Shows all workflows with full details in a project.
   * @returns workflows with full details
   */
  public async showWorkflowsWithDetails(): Promise<(Workflow | undefined)[]> {
    const promiseContainer = [];
    for (const workflow of await this.project.workflows()) {
      promiseContainer.push(this.project.workflow(workflow.name));
    }
    const results = await Promise.all(promiseContainer);
    return results.filter((item) => item);
  }
}
