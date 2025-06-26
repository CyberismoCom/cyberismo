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

// node
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

import mime from 'mime-types';

import type { attachmentPayload } from '../interfaces/request-status-interfaces.js';
import type {
  CardAttachment,
  Card,
  CardListContainer,
  ModuleContent,
  ProjectFetchCardDetails,
  ProjectMetadata,
  Resource,
  CardLocation,
} from '../interfaces/project-interfaces.js';
import type {
  CardType,
  ResourceContent,
  TemplateConfiguration,
  Workflow,
} from '../interfaces/resource-interfaces.js';
import { Project, type ResourcesFrom } from '../containers/project.js';
import { resourceName } from '../utils/resource-utils.js';
import { TemplateResource } from '../resources/template-resource.js';
import { UserPreferences } from '../utils/user-preferences.js';

import ReportMacro from '../macros/report/index.js';
import TaskQueue from '../macros/task-queue.js';
import type { Calculate } from './calculate.js';

/**
 * Show command.
 */
export class Show {
  private resourceFunction: Map<
    string,
    (from?: ResourcesFrom) => Promise<Resource[]>
  >;
  constructor(
    private project: Project,
    private calculate: Calculate,
  ) {
    this.resourceFunction = new Map([
      ['calculations', this.project.calculations.bind(this.project)],
      ['cardTypes', this.project.cardTypes.bind(this.project)],
      ['fieldTypes', this.project.fieldTypes.bind(this.project)],
      ['graphModels', this.project.graphModels.bind(this.project)],
      ['graphViews', this.project.graphViews.bind(this.project)],
      ['linkTypes', this.project.linkTypes.bind(this.project)],
      ['reports', this.project.reports.bind(this.project)],
      ['templates', this.project.templates.bind(this.project)],
      ['workflows', this.project.workflows.bind(this.project)],
    ]);
  }

  // Collect all labels from cards.
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
   * Shows all template cards in a project.
   * @returns all template cards in a project.
   */
  public async showAllTemplateCards(): Promise<
    { name: string; cards: Card[] }[]
  > {
    return Promise.all(
      (await this.project.templates()).map(async (template) => {
        const templateResource = new TemplateResource(
          this.project,
          resourceName(template.name),
        );
        return {
          name: template.name,
          cards: await templateResource.templateObject().showTemplateCards(),
        };
      }),
    );
  }

  /**
   * Shows all attachments (either template or project attachments) from a project.
   * @returns array of card attachments
   */
  public async showAttachments(): Promise<CardAttachment[]> {
    const attachments: CardAttachment[] = await this.project.attachments();
    const templateAttachments: CardAttachment[] = [];
    const templates = await this.project.templates();
    for (const template of templates) {
      const templateResource = new TemplateResource(
        this.project,
        resourceName(template.name),
      );
      const templateObject = templateResource.templateObject();
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

  /**
   * Shows details of a particular card (template card, or project card)
   * @note Note that parameter 'cardKey' is optional due to technical limitations of class calling this class. It must be defined to get valid results.
   * @param details card details to show
   * @param cardKey card key to find
   * @returns card details
   */
  public async showCardDetails(
    details: ProjectFetchCardDetails,
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
   * @param cardsFrom - The location from which to look for cards. Either from the project, templates or both.
   * @returns cards list array
   */
  public async showCards(
    cardsFrom?: CardLocation,
  ): Promise<CardListContainer[]> {
    return this.project.listCards(cardsFrom);
  }

  /**
   * Shows all card types in a project.
   * @returns array of card type details
   */
  public async showCardTypesWithDetails(): Promise<(CardType | undefined)[]> {
    const promiseContainer = [];
    for (const cardType of await this.project.cardTypes()) {
      const cardTypeDetails = await this.project.resource<CardType>(
        cardType.name,
      );
      if (cardTypeDetails) {
        promiseContainer.push(cardTypeDetails);
      }
    }
    const results = await Promise.all(promiseContainer);
    return results.filter((item) => item);
  }

  /**
   * Returns all unique labels in a project
   * @returns labels in a list
   */
  public async showLabels(): Promise<string[]> {
    const cards = await this.project.showProjectCards();
    const templateCards = await this.project.allTemplateCards({
      metadata: true,
      children: true,
    });

    const labels = this.collectLabels([...cards, ...templateCards]);
    return Array.from(new Set(labels));
  }

  /**
   * Shows details of a module.
   * @param moduleName name of a module
   * @returns details of a module.
   */
  public async showModule(moduleName: string): Promise<ModuleContent> {
    const moduleDetails = await this.project.module(moduleName);
    if (!moduleDetails) {
      throw new Error(`Module '${moduleName}' does not exist in the project`);
    }
    return moduleDetails;
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
   * Shows all modules (if any) in a project.
   * @returns all modules in a project.
   */
  public async showModules(): Promise<string[]> {
    return (await this.project.modules()).map((item) => item.name).sort();
  }

  /**
   * Shows details of a particular project.
   * @returns project information
   */
  public async showProject(): Promise<ProjectMetadata> {
    return this.project.show();
  }

  /**
   * Shows report results for a given report name and card key.
   * @param reportName Name of the report to show
   * @param cardKey Card key to use for the report
   * @param parameters Additional parameters for the report
   * @param outputPath Optional output path for the report
   * @returns Report results as a string
   * @throws Error if the report does not exist
   */
  public async showReportResults(
    reportName: string,
    cardKey: string,
    parameters: object,
    outputPath?: string,
  ): Promise<string> {
    if (
      !(await this.project.reports()).some(
        (report) => report.name === reportName,
      )
    ) {
      throw new Error(`Report '${reportName}' does not exist`);
    }

    const reportMacro = new ReportMacro(new TaskQueue(), this.calculate);
    const result = await reportMacro.handleInject(
      {
        project: this.project,
        cardKey: cardKey,
        mode: 'static',
      },
      { name: reportName, ...parameters },
    );

    // Show the results either in the console or write to a file.
    if (outputPath) {
      try {
        await writeFile(outputPath, result ?? '', 'utf-8');
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(
            `Failed to write report to ${outputPath}: ${error.message}`,
          );
        }
      }
    }
    return outputPath ? '' : (result ?? '');
  }

  /**
   * Shows details of certain resource.
   * @param name Name of resource.
   * @returns resource metadata as JSON.
   */
  public async showResource(
    name: string,
    showUse: boolean = false,
  ): Promise<ResourceContent | undefined> {
    // TODO: remove this workaround once calculations are implemented as a resource class
    if (resourceName(name).type === 'calculations') {
      return {
        name,
        displayName: resourceName(name).identifier,
      };
    }

    const strictNameCheck = true;
    const resource = Project.resourceObject(
      this.project,
      resourceName(name, strictNameCheck),
    );
    const [details, usage] = await Promise.all([
      resource?.show(),
      showUse ? resource?.usage() : [],
    ]);
    if (showUse) {
      return {
        ...details,
        usedIn: [...usage],
      };
    } else {
      return details;
    }
  }

  /**
   * Shows all available resources of a given type.
   * @param type Name of resources to return (in plural form, e.g. 'templates')
   * @returns sorted array of resources
   */
  public async showResources(type: string): Promise<string[]> {
    const func = this.resourceFunction.get(type);
    if (!func) return [];
    return (await func()).map((item) => item.name).sort();
  }

  /**
   * Shows all templates with full details in a project.
   * @returns all templates in a project.
   */
  public async showTemplatesWithDetails(): Promise<TemplateConfiguration[]> {
    const promiseContainer = (await this.project.templates()).map((template) =>
      new TemplateResource(this.project, resourceName(template.name)).show(),
    );
    const result = await Promise.all(promiseContainer);
    return result.filter(Boolean) as TemplateConfiguration[];
  }

  /**
   * Shows all workflows with full details in a project.
   * @returns workflows with full details
   */
  public async showWorkflowsWithDetails(): Promise<(Workflow | undefined)[]> {
    const promiseContainer = [];
    for (const workflow of await this.project.workflows()) {
      promiseContainer.push(this.project.resource<Workflow>(workflow.name));
    }
    const results = await Promise.all(promiseContainer);
    return results.filter((item) => item);
  }
}
