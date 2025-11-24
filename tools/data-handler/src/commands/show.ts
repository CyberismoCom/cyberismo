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
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

import { MODULE_LIST_FULL_PATH } from './fetch.js';

import type { attachmentPayload } from '../interfaces/request-status-interfaces.js';
import type {
  Card,
  CardAttachment,
  CardListContainer,
  CardLocation,
  CardWithChildrenCards,
  Context,
  FetchCardDetails,
  FileContentType,
  HubSetting,
  ModuleContent,
  ModuleSettingFromHub,
  ProjectMetadata,
  ResourceType,
} from '../interfaces/project-interfaces.js';
import type {
  AnyResourceContent,
  CardType,
  ResourceContent,
  TemplateConfiguration,
  Workflow,
} from '../interfaces/resource-interfaces.js';
import type { Project, ResourcesFrom } from '../containers/project.js';
import type { ResourceName } from '../utils/resource-utils.js';
import type { ResourceMap } from '../containers/project/resource-cache.js';

import { UserPreferences } from '../utils/user-preferences.js';
import ReportMacro from '../macros/report/index.js';
import TaskQueue from '../macros/task-queue.js';
import { evaluateMacros } from '../macros/index.js';
import { readJsonFile } from '../utils/json.js';
import { getChildLogger } from '../utils/log-utils.js';
import { buildCardHierarchy, flattenCardArray } from '../utils/card-utils.js';

/**
 * Show command.
 */
export class Show {
  private readonly resourceFunctions: Record<
    string,
    (from?: ResourcesFrom) => string[]
  > = {
    calculations: (from) => this.resourceNames('calculations', from),
    cardTypes: (from) => this.resourceNames('cardTypes', from),
    fieldTypes: (from) => this.resourceNames('fieldTypes', from),
    graphModels: (from) => this.resourceNames('graphModels', from),
    graphViews: (from) => this.resourceNames('graphViews', from),
    linkTypes: (from) => this.resourceNames('linkTypes', from),
    reports: (from) => this.resourceNames('reports', from),
    templates: (from) => this.resourceNames('templates', from),
    workflows: (from) => this.resourceNames('workflows', from),
  };

  constructor(private project: Project) {}

  private get logger() {
    return getChildLogger({
      module: 'show',
    });
  }

  // Gets all template attachments
  private async attachmentsFromTemplates() {
    const templateAttachments: CardAttachment[] = [];
    const templates = this.project.resources.templates();
    for (const template of templates) {
      const templateObject = template.templateObject();
      if (templateObject) {
        templateAttachments.push(...templateObject.attachments());
      }
    }
    return templateAttachments;
  }

  // Fetch resource names as a list
  private resourceNames<T extends keyof ResourceMap>(
    resourceType: T,
    from?: ResourcesFrom,
  ): string[] {
    return this.project.resources
      .resourceTypes(resourceType, from)
      .map((item) => item.data?.name || '');
  }

  // Collect all labels from cards.
  private collectLabels = (cards: Card[]): string[] => {
    return cards.reduce<string[]>((labels, card) => {
      // Add the labels from the current card
      if (card.metadata?.labels) {
        labels.push(...card.metadata.labels);
      }
      return labels;
    }, []);
  };

  // Returns attachment details
  private getAttachment(cardKey: string, filename: string) {
    const card = this.project.findCard(cardKey);
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
  public showAllTemplateCards(): {
    name: string;
    cards: CardWithChildrenCards[];
  }[] {
    return this.project.resources.templates().map((template) => {
      const cards = template.templateObject().listCards();
      const buildCards = buildCardHierarchy(cards);

      return {
        name: template.data?.name || '',
        cards: buildCards,
      };
    });
  }

  /**
   * Shows all attachments (either template or project attachments) from a project.
   * @returns array of card attachments
   */
  public async showAttachments(): Promise<CardAttachment[]> {
    const attachments = this.project.attachments();
    const templateAttachments = await this.attachmentsFromTemplates();
    attachments.push(...templateAttachments);
    return attachments;
  }

  /**
   * Returns file buffer and mime type of an attachment. Used by app UI to download attachments.
   * @param cardKey card key to find
   * @param filename attachment filename
   * @returns attachment details
   */
  public showAttachment(cardKey: string, filename: string): attachmentPayload {
    if (!cardKey) {
      throw new Error(`Mandatory parameter 'cardKey' missing`);
    }

    const attachment = this.getAttachment(cardKey, filename);

    if (!attachment) {
      throw new Error(`Attachment '${filename}' not found for card ${cardKey}`);
    }

    const attachmentPath = `${attachment.path}/${attachment.fileName}`;
    const fileBuffer = readFileSync(attachmentPath);
    const mimeType = attachment.mimeType || 'application/octet-stream';
    const payload: attachmentPayload = { fileBuffer, mimeType };
    return payload;
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
    const attachment = this.getAttachment(cardKey, filename);

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
   * @param cardKey card key to find
   * @param contentType Content format in which content is to be shown
   * @returns card details
   */
  public showCardDetails(
    cardKey?: string,
    contentType?: FileContentType,
  ): Card {
    if (!cardKey) {
      throw new Error(`Mandatory parameter 'cardKey' missing`);
    }
    // todo: Make a constant about this
    const details: FetchCardDetails = {
      parent: true,
      metadata: true,
      children: true,
      attachments: true,
      content: true,
    };
    if (contentType) {
      details.contentType = contentType;
    }
    return this.project.findCard(cardKey, details);
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
   * Shows the content of a logic program.
   * @param cardKey The key of the card.
   * @returns the content of the logic program.
   */
  public async showCardLogicProgram(cardKey: string) {
    return this.project.calculationEngine.cardLogicProgram(cardKey);
  }

  /**
   * Shows all card types in a project.
   * @returns array of card type details
   */
  public async showCardTypesWithDetails(): Promise<(CardType | undefined)[]> {
    const container = [];
    for (const cardType of this.project.resources.cardTypes()) {
      if (cardType.data) {
        container.push(cardType.data);
      }
    }
    return container;
  }

  /**
   * Shows importable modules.
   * @param showAll - When true, shows all importable modules, even if they have already been imported
   * @param showDetails - When true, shows all properties of modules, not just name.
   * @returns list of modules; the list content depends on the parameters provided
   *          by default it is a list of module names that could be imported into the project,
   *          with 'showDetails' true, instead of name, the list consists of full details of the modules
   *          with 'showAll' true, the list consists of all modules in the hubs, even if they have already been imported
   *          Note that the two boolean options can be combined.
   */
  public async showImportableModules(
    showAll?: boolean,
    showDetails?: boolean,
  ): Promise<ModuleSettingFromHub[]> {
    try {
      const moduleList = (
        await readJsonFile(
          resolve(this.project.basePath, MODULE_LIST_FULL_PATH),
        )
      ).modules;
      const currentModules = this.project.resources.moduleNames();
      const nonImportedModules = moduleList.filter(
        (item: ModuleSettingFromHub) => {
          return !currentModules.some((module) => item.name === module);
        },
      );

      if (showAll && showDetails) {
        return moduleList;
      }
      if (showAll) {
        return moduleList?.map((item: ModuleSettingFromHub) => item?.name);
      }
      if (showDetails) {
        return nonImportedModules;
      }
      // By default return the non-imported modules
      return nonImportedModules.map((item: ModuleSettingFromHub) => item?.name);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(error.message);
      }
      // Module list doesn't exist, return empty list
      return [];
    }
  }

  /**
   * Returns all unique labels in a project
   * @returns labels in a list
   */
  public showLabels(): string[] {
    const cards = flattenCardArray(
      this.project.showProjectCards(),
      this.project,
    );
    const templateCards = this.project.allTemplateCards();

    const labels = this.collectLabels([...cards, ...templateCards]);
    return Array.from(new Set(labels));
  }

  /**
   * Shows the content of a logic program.
   * @param resource Name of the resource.
   * @returns the content of the logic program.
   */
  public async showLogicProgram(resource: ResourceName) {
    return this.project.calculationEngine.resourceLogicProgram(resource);
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
   * Shows hubs of the project.
   * @returns list of hubs.
   */
  public showHubs(): HubSetting[] {
    return this.project.configuration.hubs;
  }

  /**
   * Returns all project cards in the project. Cards don't have content and nor metadata.
   * @returns array of cards
   */
  public showProjectCards(): Card[] {
    return this.project.showProjectCards();
  }

  /**
   * Shows all modules (if any) in a project.
   * @returns all modules in a project.
   */
  public showModules(): string[] {
    return this.project.resources.moduleNames().sort();
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
   * @param context Context for resource (includes a project instance)
   * @param outputPath Optional output path for the report
   * @returns Report results as a string
   * @throws Error if the report does not exist
   */
  public async showReportResults(
    reportName: string,
    cardKey: string,
    parameters: object,
    context: Context,
    outputPath?: string,
  ): Promise<string> {
    if (
      !this.project.resources
        .reports()
        .some((report) => report.data?.name === reportName)
    ) {
      throw new Error(`Report '${reportName}' does not exist`);
    }

    await this.project.calculationEngine.generate();
    const reportMacro = new ReportMacro(new TaskQueue());
    let result = await reportMacro.handleStatic(
      {
        project: this.project,
        cardKey: cardKey,
        mode: 'static',
        context,
      },
      { name: reportName, ...parameters },
    );

    result = await evaluateMacros(result, {
      project: this.project,
      cardKey: cardKey,
      mode: 'static',
      context,
    });

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
   * @param showUse If true, shows also where resource is used.
   * @param resourceType If specified, checks that the resource is given type.
   * @returns resource metadata as JSON.
   */
  public async showResource(
    name: string,
    showUse?: boolean,
  ): Promise<AnyResourceContent>;
  public async showResource<T extends ResourceType>(
    name: string,
    resourceType: T,
    showUse?: boolean,
  ): Promise<ResourceContent<T>>;
  public async showResource(
    name: string,
    arg2?: boolean | ResourceType,
    arg3?: boolean,
  ): Promise<AnyResourceContent> {
    const hasResourceType = typeof arg2 === 'string';
    const resourceType = hasResourceType ? arg2 : null;
    const showUse = hasResourceType ? arg3 : arg2;

    const type = this.project.resources.extractType(name);
    if (resourceType !== null && resourceType !== type) {
      throw new Error(
        `While fetching '${name}': Expected type '${resourceType}', but got '${type}' instead`,
      );
    }
    const resource = this.project.resources.byType(name, type);
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
    const func = this.resourceFunctions[type];
    if (!func) return [];
    return func().sort();
  }

  /**
   * Shows all templates with full details in a project.
   * @returns all templates in a project.
   */
  public async showTemplatesWithDetails(): Promise<TemplateConfiguration[]> {
    const templates = [];
    for (const template of this.project.resources.templates()) {
      templates.push(await template.show());
    }
    return templates;
  }

  /**
   * Shows all workflows with full details in a project.
   * @returns workflows with full details
   */
  public showWorkflowsWithDetails(): (Workflow | undefined)[] {
    const workflows = [];
    for (const workflow of this.project.resources.workflows()) {
      workflows.push(workflow.data);
    }
    return workflows;
  }
}
