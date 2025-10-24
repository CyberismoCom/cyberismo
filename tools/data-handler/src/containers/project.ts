/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { basename, join, resolve } from 'node:path';
import {
  constants as fsConstants,
  copyFile,
  mkdir,
  unlink,
  writeFile,
} from 'node:fs/promises';

// base class
import { CardContainer } from './card-container.js';

import { CalculationEngine } from './project/calculation-engine.js';
import {
  type Card,
  type CardAttachment,
  CardLocation,
  type CardListContainer,
  type CardMetadata,
  type FetchCardDetails,
  type MetadataContent,
  type ModuleContent,
  type ModuleSetting,
  type ProjectFetchCardDetails,
  type ProjectMetadata,
} from '../interfaces/project-interfaces.js';
import { pathExists } from '../utils/file-utils.js';
import { generateRandomString } from '../utils/random.js';
import {
  cardPathParts,
  isModulePath,
  isTemplateCard,
} from '../utils/card-utils.js';
import { ProjectConfiguration } from '../project-settings.js';
import { ProjectPaths } from './project/project-paths.js';
import { readJsonFile } from '../utils/json.js';
import type { ResourceName } from '../utils/resource-utils.js';
import {
  ResourcesFrom,
  ResourceCache,
  type ResourceMap,
} from './project/resource-cache.js';
import type { Template } from './template.js';
import { Validate } from '../commands/validate.js';

import { CalculationResource } from '../resources/calculation-resource.js';
import { CardTypeResource } from '../resources/card-type-resource.js';
import { FieldTypeResource } from '../resources/field-type-resource.js';
import { GraphModelResource } from '../resources/graph-model-resource.js';
import { GraphViewResource } from '../resources/graph-view-resource.js';
import { LinkTypeResource } from '../resources/link-type-resource.js';
import { ReportResource } from '../resources/report-resource.js';
import { TemplateResource } from '../resources/template-resource.js';
import { WorkflowResource } from '../resources/workflow-resource.js';

import { ContentWatcher } from './project/project-content-watcher.js';
import { getChildLogger } from '../utils/log-utils.js';

import { ROOT } from '../utils/constants.js';

// Re-export this, so that classes that use Project do not need to have separate import.
export { ResourcesFrom };

/**
 * Represents project folder.
 */
export class Project extends CardContainer {
  public calculationEngine: CalculationEngine;
  private logger = getChildLogger({ module: 'Project' });
  private projectPaths: ProjectPaths;
  private resources: ResourceCache;
  private resourceWatcher: ContentWatcher | undefined;
  private settings: ProjectConfiguration;
  private validator: Validate;

  constructor(
    path: string,
    private watchResourceChanges?: boolean,
  ) {
    const settings = new ProjectConfiguration(
      join(path, '.cards', 'local', Project.projectConfigFileName),
    );
    super(path, settings.cardKeyPrefix, '');
    this.settings = settings;

    this.logger.info({ path }, 'Initializing project');

    this.calculationEngine = new CalculationEngine(this);
    this.projectPaths = new ProjectPaths(path);
    this.resources = new ResourceCache(this, this.createResource());

    this.containerName = this.settings.name;
    // todo: implement project validation
    this.validator = Validate.getInstance();
    this.logger.info(
      { resourcesFolder: this.paths.resourcesFolder },
      'Collecting resources',
    );
    this.resources.collectLocalResources();
    this.logger.info(
      { name: this.containerName },
      'Project initialization complete',
    );

    const ignoreRenameFileChanges = true;

    // Watch changes in .cards if there are multiple instances of Project being
    // run concurrently.
    if (this.watchResourceChanges) {
      this.resourceWatcher = new ContentWatcher(
        ignoreRenameFileChanges,
        this.paths.resourcesFolder,
        (fileName: string) => {
          void (async () => {
            this.resources.handleFileSystemChange(
              join(this.paths.resourcesFolder, fileName),
            );
            this.resources.changed();
          })();
        },
      );
    }
  }

  // Resource factory function to break circular dependency
  private createResource() {
    return (project: Project, resourceName: ResourceName): unknown => {
      if (resourceName.type === 'calculations') {
        return new CalculationResource(project, resourceName);
      } else if (resourceName.type === 'cardTypes') {
        return new CardTypeResource(project, resourceName);
      } else if (resourceName.type === 'fieldTypes') {
        return new FieldTypeResource(project, resourceName);
      } else if (resourceName.type === 'graphModels') {
        return new GraphModelResource(project, resourceName);
      } else if (resourceName.type === 'graphViews') {
        return new GraphViewResource(project, resourceName);
      } else if (resourceName.type === 'linkTypes') {
        return new LinkTypeResource(project, resourceName);
      } else if (resourceName.type === 'reports') {
        return new ReportResource(project, resourceName);
      } else if (resourceName.type === 'templates') {
        return new TemplateResource(project, resourceName);
      } else if (resourceName.type === 'workflows') {
        return new WorkflowResource(project, resourceName);
      }
      throw new Error(`Unsupported resource type '${resourceName.type}'`);
    };
  }

  // Changes a card's parent in the cache and updates all relationships.
  private changeParent(updatedCard: Card, previousParent?: string) {
    if (previousParent && previousParent !== ROOT) {
      this.removeCachedChildren(previousParent, updatedCard.key);
    }
    if (updatedCard.parent && updatedCard.parent !== ROOT) {
      this.updateCachedChildren(updatedCard.parent, updatedCard);
    }
    this.cardCache.updateCard(updatedCard.key, updatedCard);
  }

  // Finds specific module.
  private async findModule(
    moduleName: string,
  ): Promise<{ name: string; path: string } | undefined> {
    const moduleExists = this.resources.moduleNames().includes(moduleName);
    if (!moduleExists) {
      return undefined;
    }

    // For modules, we need to construct the local path where the module is stored
    const moduleConfig = this.configuration.modules?.find(
      (module) => module.name === moduleName,
    );
    if (!moduleConfig) {
      return undefined;
    }

    return {
      name: moduleName,
      path: join(this.paths.modulesFolder, moduleConfig.name),
    };
  }

  // Handles attachment changes after filesystem operations.
  private async handleAttachmentChange(
    cardKey: string,
    operation: 'added' | 'removed' | 'refresh',
    fileName: string,
  ): Promise<void> {
    if (operation === 'added') {
      this.cardCache.addAttachment(cardKey, fileName);
    } else if (operation === 'removed') {
      this.cardCache.deleteAttachment(cardKey, fileName);
    } else if (operation === 'refresh') {
      const newAttachments = this.cardCache.getCardAttachments(cardKey);
      if (newAttachments) {
        this.cardCache.updateCardAttachments(cardKey, newAttachments);
      }
    }
  }

  // Determines the parent card key from a card's filesystem path.
  private parentFromPath(cardPath: string): string {
    return cardPathParts(this.projectPrefix, cardPath).parents.at(-1) || 'root';
  }

  // Remove children from a card in the card cache
  private removeCachedChildren(parentKey: string, childKey: string) {
    const parentCard = this.cardCache.getCard(parentKey);
    if (parentCard && parentCard.children) {
      parentCard.children = parentCard.children.filter(
        (child) => child !== childKey,
      );
      this.cardCache.updateCard(parentCard.key, parentCard);
    }
  }

  // Updates children in the card cache
  private updateCachedChildren(parentKey: string, newChild: Card) {
    const parentCard = this.cardCache.getCard(parentKey);
    if (parentCard) {
      // Add or update the child in the parent's children array
      const existingChildIndex = parentCard.children?.findIndex(
        (child) => child === newChild.key,
      );
      if (existingChildIndex === -1) {
        parentCard.children.push(newChild.key);
      }
      this.cardCache.updateCard(parentCard.key, parentCard);
    }
  }

  // Validates that card's data is valid.
  private async validateCard(card: Card): Promise<string> {
    const invalidCustomData = await this.validator.validateCustomFields(
      this,
      card,
    );
    const invalidWorkFlow = this.validator.validateWorkflowState(this, card);

    const invalidLabels = this.validator.validateCardLabels(card);
    if (
      invalidCustomData.length === 0 &&
      invalidWorkFlow.length === 0 &&
      invalidLabels.length === 0
    ) {
      return '';
    }
    const errors: string[] = [];
    if (invalidCustomData.length > 0) {
      errors.push(invalidCustomData);
    }
    if (invalidWorkFlow.length > 0) {
      errors.push(invalidWorkFlow);
    }
    if (invalidLabels.length > 0) {
      errors.push(invalidLabels);
    }
    return errors.join('\n');
  }

  /**
   * Populate template cards into the card cache.
   */
  protected async populateTemplateCards(): Promise<void> {
    try {
      // Gets local & module templates
      const templateResources = this.templates();
      const prefixes = await this.projectPrefixes();
      for (const template of templateResources) {
        try {
          this.validator.validResourceName(
            'templates',
            template.data?.name || '',
            prefixes,
          );
        } catch (error) {
          this.logger.warn(
            { templateName: template, error },
            `Template name '${template}' does not follow required format, skipping`,
          );
          continue;
        }

        const templateObject = template.templateObject();
        const isCreated = templateObject && templateObject.isCreated();
        if (!templateObject || !isCreated) {
          continue;
        }

        await this.cardCache.populateFromPath(
          templateObject.templateCardsFolder(),
        );
      }
    } catch (error) {
      this.logger.error(
        { error },
        'Failed to populate template cards into the card cache',
      );
    }
  }

  /**
   * Populate both the project cards, and all template cards into card cache.
   */
  protected async populateCardsCache(): Promise<void> {
    await this.cardCache.populateFromPath(this.paths.cardRootFolder);
    await this.populateTemplateCards();
  }

  /**
   * Returns all template cards from the project. This includes all module templates' cards.
   * @returns all the template cards from the project
   */
  public allTemplateCards(): Card[] {
    return this.cardCache.getAllTemplateCards();
  }

  /**
   * Returns an array of all the attachments in the project card's (excluding ones in templates).
   * @returns all attachments in the project.
   */
  public attachments(): CardAttachment[] {
    return super.attachments(this.paths.cardRootFolder);
  }

  /**
   * Returns attachments from cards at a specific path using the card cache.
   * This method allows templates to access attachments from the shared cache.
   * @param path The path to get attachments from
   * @returns Array of attachments from cards at the specified path
   */
  public attachmentsByPath(path: string): CardAttachment[] {
    return super.attachments(path);
  }

  /**
   * Returns all the attachments in the template cards.
   * @returns all the attachments in the template cards.
   */
  public async attachmentsFromTemplates() {
    const templateAttachments: CardAttachment[] = [];
    const templates = this.templates();
    for (const template of templates) {
      const templateObject = template.templateObject();
      if (templateObject) {
        templateAttachments.push(...templateObject.attachments());
      }
    }
    return templateAttachments;
  }

  /**
   * Returns an array of calculation resource names in the project.
   * @param from Defines where resources are collected from.
   * @returns array of calculation resource names in the project.
   */
  public calculationNames(from: ResourcesFrom = ResourcesFrom.all): string[] {
    return this.resources
      .resources('calculations', from)
      .map((item) => item.data?.name || '');
  }

  /**
   * Returns an array of calculation resources in the project.
   * @param from Defines where resources are collected from.
   * @returns array of calculation resources in the project.
   */
  public calculations(
    from: ResourcesFrom = ResourcesFrom.all,
  ): CalculationResource[] {
    return this.resources.resources('calculations', from);
  }

  /**
   * Returns path to a card's attachment folder.
   * @param cardKey card key
   * @returns path to a card's attachment folder.
   */
  public cardAttachmentFolder(cardKey: string): string {
    const pathToCard = this.findCard(cardKey).path;
    return join(pathToCard, 'a');
  }

  /**
   * Creates an attachment for a card.
   * @param cardKey The card to add attachment to
   * @param attachmentName The name for the attachment file
   * @param attachmentData The attachment data (file path or buffer)
   * @throws If trying to add attachment to module card, or if attachment is not found
   */
  public async createCardAttachment(
    cardKey: string,
    attachmentName: string,
    attachmentData: string | Buffer,
  ): Promise<void> {
    const attachmentFolder = this.cardAttachmentFolder(cardKey);

    // Check if this is a module template
    if (isModulePath(attachmentFolder)) {
      throw new Error(`Cannot modify imported module`);
    }

    // Create the attachment folder if it doesn't exist
    await mkdir(attachmentFolder, { recursive: true });

    const attachmentPath = join(attachmentFolder, basename(attachmentName));

    if (Buffer.isBuffer(attachmentData)) {
      await writeFile(attachmentPath, attachmentData, { flag: 'wx' });
    } else {
      if (!pathExists(attachmentData)) {
        throw new Error(`Attachment file not found: ${attachmentData}`);
      }
      await copyFile(attachmentData, attachmentPath, fsConstants.COPYFILE_EXCL);
    }

    // Update cache
    await this.handleAttachmentChange(
      cardKey,
      'added',
      basename(attachmentName),
    );
  }

  /**
   * Returns path to a card's folder.
   * @param cardKey card key
   * @returns path to a card's folder.
   */
  public async cardFolder(cardKey: string): Promise<string> {
    const found = super.findCard(cardKey);
    if (found) {
      return found.path;
    }

    const templates = this.templates();
    const templatePromises = templates.map((template) => {
      const templateObject = template.templateObject();
      const templateCard = templateObject
        ? templateObject.findCard(cardKey)
        : undefined;
      const path = templateCard ? templateCard.path : '';
      return path;
    });

    const templatePaths = await Promise.all(templatePromises);
    return templatePaths.find((path) => path !== '') || '';
  }

  /**
   * Fetches full Card data for given card keys
   * @param cardIds array of card keys to fetch
   * @returns Card data to the given card keys
   */
  public cardKeysToCards(cardIds: string[]): Card[] {
    const cards: Card[] = [];
    for (const cardId of cardIds) {
      const card = this.cardCache.getCard(cardId);
      if (card) {
        cards.push(card);
      }
    }
    return cards;
  }

  /**
   * Returns an array of all the cards in the project.
   * @note These are project cards only, by default (unless path dictates otherwise).
   * @param path Path from which to fetch the cards. Generally it is best to fetch from Project root, e.g. Project.cardRootFolder
   * @param details Which details to include in the cards; by default all details are included.
   * @returns all cards from the given path in the project.
   */
  public cards(
    path: string = this.paths.cardRootFolder,
    details?: FetchCardDetails,
  ): Card[] {
    return super.cards(path, details);
  }

  /**
   * Accessor for cards cache.
   * Used by template container (it needs to access project's cache, not their own instance).
   * @note Should not be used directly (other than Template).
   */
  public get cardsCache() {
    return this.cardCache;
  }

  /**
   * Returns an array of card type names in the project.
   * @param from Defines where resources are collected from.
   * @returns array of all card types in the project.
   */
  public cardTypeNames(from: ResourcesFrom = ResourcesFrom.all): string[] {
    return this.resources
      .resources('cardTypes', from)
      .map((item) => item.data?.name || '');
  }

  /**
   * Returns an array of card types in the project.
   * @param from Defines where resources are collected from.
   * @returns array of all card types in the project.
   */
  public cardTypes(
    from: ResourcesFrom = ResourcesFrom.all,
  ): CardTypeResource[] {
    return this.resources.resources('cardTypes', from);
  }

  /**
   * Renames a resource in the resource cache.
   * @param oldName Old name of the resource.
   * @param newName new name of the resource.
   */
  public changeResourceName(oldName: string, newName: string) {
    this.resources.changeResourceName(oldName, newName);
  }

  /**
   * Returns children of a given card; as Card array
   * @param card Parent card to fetch children from
   * @returns children of a given card; as Card array
   */
  public childrenCards(card: Card): Card[] {
    const cards: Card[] = [];
    for (const child of card.children) {
      const card = this.cardCache.getCard(child);
      if (card) {
        cards.push(card);
      }
    }
    return cards;
  }

  /**
   * Updates all local resources.
   */
  public collectLocalResources() {
    this.resources.changed();
  }

  /**
   * Updates all imported module resources.
   */
  public async collectModuleResources() {
    await this.resources.changedModules();
  }

  /**
   * Returns project configuration.
   * @returns project configuration.
   */
  public get configuration(): ProjectConfiguration {
    return this.settings;
  }

  /**
   * Creates a Template object from template Card. It is ensured that the template is part of project.
   * @param card Card that is part of some template.
   * @returns Template object, or undefined if card is not part of template.
   */
  public createTemplateObjectFromCard(card: Card): Template | undefined {
    if (!card || !card.path || !isTemplateCard(card)) {
      return undefined;
    }
    const { template } = cardPathParts(this.projectPrefix, card.path);
    const templateResource = this.resourceByType(template, 'templates');
    return templateResource.templateObject();
  }

  /**
   * Cleanups project when it is being closed.
   */
  public dispose() {
    if (this.resourceWatcher) {
      this.resourceWatcher.close();
      this.resourceWatcher = undefined;
    }
  }

  /**
   * Returns an array of field type names in the project.
   * @param from Defines where resources are collected from.
   * @returns array of all field types in the project.
   */
  public fieldTypeNames(from: ResourcesFrom = ResourcesFrom.all): string[] {
    return this.resources
      .resources('fieldTypes', from)
      .map((item) => item.data?.name || '');
  }

  /**
   * Returns an array of field types in the project.
   * @param from Defines where resources are collected from.
   * @returns array of all field types in the project.
   */
  public fieldTypes(
    from: ResourcesFrom = ResourcesFrom.all,
  ): FieldTypeResource[] {
    return this.resources.resources('fieldTypes', from);
  }

  /**
   * Returns specific card.
   * @param cardToFind Card key to find
   * @param details Defines which card details are included in the return values.
   * @returns specific card details, or undefined if card is not part of the project.
   */
  public findCard(cardToFind: string, details?: ProjectFetchCardDetails): Card {
    return super.findCard(cardToFind, details);
  }

  /**
   * Finds root of a project
   * @param path Path where to start looking for the project root.
   * @returns path to a project root, or empty string.
   */
  public static async findProjectRoot(path: string): Promise<string> {
    const currentPath = resolve(join(path, '.cards'));
    if (pathExists(currentPath)) {
      return path;
    }

    const parentPath = resolve(path, '..');
    if (parentPath === path) {
      return '';
    }

    return Project.findProjectRoot(parentPath);
  }

  /**
   * Returns an array of graph model names in the project.
   * @param from Defines where resources are collected from.
   * @returns array of graph model names in the project.
   */
  public graphModelNames(from: ResourcesFrom = ResourcesFrom.all): string[] {
    return this.resources
      .resources('graphModels', from)
      .map((item) => item.data?.name || '');
  }

  /**
   * Returns an array of graph models in the project.
   * @param from Defines where resources are collected from.
   * @returns array of graph models in the project.
   */
  public graphModels(
    from: ResourcesFrom = ResourcesFrom.all,
  ): GraphModelResource[] {
    return this.resources.resources('graphModels', from);
  }

  /**
   * Returns an array of graph view names in the project.
   * @param from Defines where resources are collected from.
   * @returns array of graph view names in the project.
   */
  public graphViewNames(from: ResourcesFrom = ResourcesFrom.all): string[] {
    return this.resources
      .resources('graphViews', from)
      .map((item) => item.data?.name || '');
  }

  /**
   * Returns an array of graph views in the project.
   * @param from Defines where resources are collected from.
   * @returns array of graph views in the project.
   */
  public graphViews(
    from: ResourcesFrom = ResourcesFrom.all,
  ): GraphViewResource[] {
    return this.resources.resources('graphViews', from);
  }

  /**
   * When card changes.
   * @param changedCard Card that was changed.
   */
  public async handleCardChanged(changedCard: Card) {
    // Notify the calculation engine about the change
    return this.calculationEngine.handleCardChanged(changedCard);
  }

  /**
   * When cards are removed.
   * @param deletedCard Card that is to be removed.
   */
  public async handleCardDeleted(deletedCard: Card) {
    // Delete children from the cache first
    if (deletedCard.children && deletedCard.children.length > 0) {
      for (const child of deletedCard.children) {
        try {
          const childCard = this.findCard(child);
          await this.handleCardDeleted(childCard);
        } catch {
          this.logger.warn(
            `Accessing child '${child}' of '${deletedCard.key}' when deleting cards caused an exception`,
          );
          continue;
        }
      }
    }
    await super.removeCard(deletedCard.key);
    return this.calculationEngine.handleDeleteCard(deletedCard);
  }

  /**
   * When card is moved.
   * @param movedCard Card that moved
   * @param newParentCard New parent for the 'movedCard'
   * @param oldParentCard Previous parent of the 'movedCard'
   */
  public async handleCardMoved(
    movedCard: Card,
    newParentCard?: Card,
    oldParentCard?: Card,
  ) {
    if (newParentCard) {
      this.cardCache.updateCard(newParentCard.key, newParentCard);
    }
    if (oldParentCard) {
      this.cardCache.updateCard(oldParentCard.key, oldParentCard);
    }
    this.cardCache.updateCard(movedCard.key, movedCard);

    // todo: it would be enough to just update parent, previous parent and changed card
    this.cardCache.populateChildrenRelationships();
    await this.handleCardChanged(movedCard);
    await this.calculationEngine.handleCardMoved();
  }

  /**
   * When new cards are added.
   * @param cards Added cards.
   */
  public async handleNewCards(cards: Card[]) {
    // Add new cards to the card cache
    cards.forEach((card) => {
      const cardWithParent = {
        ...card,
        parent: card.parent || this.parentFromPath(card.path),
      };

      this.cardCache.updateCard(cardWithParent.key, cardWithParent);

      // Update the parent's children list in the cache
      if (cardWithParent.parent && cardWithParent.parent !== ROOT) {
        this.updateCachedChildren(cardWithParent.parent, cardWithParent);
      }
    });
    return this.calculationEngine.handleNewCards(cards);
  }

  /**
   * Adds a module from project.
   * @param module Module to add
   */
  public async importModule(module: ModuleSetting) {
    // Add module as a dependency.
    await this.configuration.addModule(module);
    await this.collectModuleResources();
    await this.populateTemplateCards();
    this.logger.info(`Imported module '${module.name}'`);
  }

  /**
   * Invalidates resource from the resource cache.
   * @param name Name of the resource.
   */
  public invalidateResource(name: string) {
    this.resources.invalidateResource(name);
  }

  /**
   * Checks if a given path is a project.
   * @param path Path to a project
   * @returns true, if in the given path there is a project; false otherwise
   */
  static isCreated(path: string): boolean {
    return pathExists(join(path, 'cardRoot'));
  }

  /**
   * Returns an array of link type names in the project.
   * @param from Defines where resources are collected from.
   * @returns array of link type names in the project.
   */
  public linkTypeNames(from: ResourcesFrom = ResourcesFrom.all): string[] {
    return this.resources
      .resources('linkTypes', from)
      .map((item) => item.data?.name || '');
  }

  /**
   * Returns an array of link types in the project.
   * @param from Defines where resources are collected from.
   * @returns array of types in the project.
   */
  public linkTypes(
    from: ResourcesFrom = ResourcesFrom.all,
  ): LinkTypeResource[] {
    return this.resources.resources('linkTypes', from);
  }

  /**
   * Returns an array of cards in the project, in the templates or both.
   * Cards don't have content and nor metadata.
   * @param cardsFrom Where to return cards from (project, templates, or both)
   * @returns all cards in the project per container.
   */
  public async listCards(
    cardsFrom: CardLocation = CardLocation.all,
  ): Promise<CardListContainer[]> {
    const cardListContainer: CardListContainer[] = [];
    if (
      cardsFrom === CardLocation.all ||
      cardsFrom === CardLocation.projectOnly
    ) {
      const projectCards = super
        .cards(this.paths.cardRootFolder)
        .map((item) => item.key);
      cardListContainer.push({
        name: this.projectName,
        type: 'project',
        cards: projectCards,
      });
    }

    if (
      cardsFrom === CardLocation.all ||
      cardsFrom === CardLocation.templatesOnly
    ) {
      const templates = this.templates();
      for (const template of templates) {
        const templateObject = template.templateObject();
        if (templateObject) {
          // todo: optimization - do all this in parallel
          const templateCards = templateObject.listCards();
          if (templateCards.length) {
            cardListContainer.push({
              name: template.data?.name || '',
              type: 'template',
              cards: templateCards.map((item) => item.key),
            });
          }
        }
      }
    }
    return cardListContainer;
  }

  /**
   * Return cardIDs of the cards in the project or from templates, or both.
   * @param cardsFrom Where to return cards from (project, templates, or both)
   * @returns Array of cardIDs.
   * @note that cardIDs are not sorted.
   */
  public async listCardIds(
    cardsFrom: CardLocation = CardLocation.all,
  ): Promise<Set<string>> {
    const cardContainers = await this.listCards(cardsFrom);
    const allCardIDs = new Set<string>();
    for (const container of cardContainers) {
      const cards = container.cards;
      cards.forEach((card) => allCardIDs.add(card));
    }
    return allCardIDs;
  }

  /**
   * Returns details of a certain module.
   * @param moduleName Name of the module.
   * @returns module details, or undefined if module cannot be found.
   */
  public async module(moduleName: string): Promise<ModuleContent | undefined> {
    const module = await this.findModule(moduleName);
    if (module && module.path) {
      const modulePath = module.path;
      const moduleConfig = await readJsonFile(
        join(modulePath, Project.projectConfigFileName),
      );
      return {
        name: moduleConfig.name,
        modules: moduleConfig.modules,
        hubs: moduleConfig.hubs,
        path: modulePath,
        cardKeyPrefix: moduleConfig.cardKeyPrefix,
        calculations: this.resources.moduleResourceNames(
          'calculations',
          moduleName,
        ),
        cardTypes: this.resources.moduleResourceNames('cardTypes', moduleName),
        fieldTypes: this.resources.moduleResourceNames(
          'fieldTypes',
          moduleName,
        ),
        graphModels: this.resources.moduleResourceNames(
          'graphModels',
          moduleName,
        ),
        graphViews: this.resources.moduleResourceNames(
          'graphViews',
          moduleName,
        ),
        linkTypes: this.resources.moduleResourceNames('linkTypes', moduleName),
        reports: this.resources.moduleResourceNames('reports', moduleName),
        templates: this.resources.moduleResourceNames('templates', moduleName),
        workflows: this.resources.moduleResourceNames('workflows', moduleName),
      };
    }
    return undefined;
  }

  /**
   * Returns list of modules in the project.
   * @returns list of modules in the project.
   */
  public modules(): string[] {
    return this.resources.moduleNames();
  }

  /**
   * Returns a new unique card key with project prefix (e.g. test_x649it4x).
   * Random part of string will be always 8 characters in base-36 (0-9a-z)
   * @param cardIds map of card ids in use already
   * @returns a new card key string
   * @throws if a unique key could not be created within set number of attempts
   */
  public newCardKey(cardIds: Set<string>): string {
    const maxAttempts = 10;
    const base = 36;
    const length = 8;
    for (let i = 0; i < maxAttempts; i++) {
      // Create a key and check that there are no collisions with other keys in project
      const newKey = `${this.settings.cardKeyPrefix}_${generateRandomString(base, length)}`;
      if (cardIds.has(newKey)) {
        continue;
      } else {
        cardIds.add(newKey);
      }
      return newKey;
    }

    throw new Error('Could not generate unique card key');
  }

  /**
   * Returns an array of new unique card keys with project prefix (e.g. test_x649it4x).
   * Random part of string will be always 8 characters in base-36 (0-9a-z)
   * @param keysToCreate How many new cards are to be created.
   * @param cardIds map of card ids in use already
   * @returns an array of new card key strings
   * @throws if a unique key could not be created within set number of attempts
   */
  public newCardKeys(keysToCreate: number, cardIds: Set<string>): string[] {
    if (keysToCreate < 1) {
      return [];
    }
    const createdKeys: string[] = [];
    const base = 36;
    const length = 8;
    let maxAttempts = 10 * keysToCreate;
    while (true) {
      if (maxAttempts <= 0) {
        throw new Error('Could not generate unique card key');
      }
      const newKey = `${this.settings.cardKeyPrefix}_${generateRandomString(base, length)}`;
      if (cardIds.has(newKey)) {
        --maxAttempts;
        continue;
      } else {
        cardIds.add(newKey);
        createdKeys.push(newKey);
      }
      if (createdKeys.length >= keysToCreate) {
        break;
      }
    }
    return createdKeys;
  }

  /**
   * Returns a class that handles the project's paths.
   */
  public get paths(): ProjectPaths {
    return this.projectPaths;
  }

  /**
   * Populates the card cache, if it has not been populated.
   */
  public async populateCaches() {
    if (!this.cardCache.isPopulated) {
      // Only collect modules that are registered in the project configuration
      if (this.configuration.modules && this.configuration.modules.length > 0) {
        await this.resources.collectModuleResources();
      }
      await this.populateCardsCache();
    }
  }

  /**
   * Returns project name.
   */
  public get projectName(): string {
    return this.settings.name;
  }

  /**
   * Returns project prefix.
   */
  public get projectPrefix(): string {
    return this.settings.cardKeyPrefix;
  }

  /**
   * Collects all prefixes used in the project (project's own plus all from modules).
   * @returns all prefixes used in the project.
   */
  public async projectPrefixes(): Promise<string[]> {
    const prefixes: string[] = [this.projectPrefix];
    const moduleNames = this.resources.moduleNames();
    prefixes.push(...moduleNames);

    return prefixes;
  }

  /**
   * Removes an attachment from a card.
   * @param cardKey The card to remove attachment from
   * @param fileName The name of the attachment file to remove
   * @throws if trying to remove module card attachment, or the attachment was not found.
   */
  public async removeCardAttachment(
    cardKey: string,
    fileName: string,
  ): Promise<void> {
    const attachmentFolder = this.cardAttachmentFolder(cardKey);

    // Modules cannot be modified.
    if (isModulePath(attachmentFolder)) {
      throw new Error(`Cannot modify imported module`);
    }

    const attachmentPath = join(attachmentFolder, fileName);

    if (!pathExists(attachmentPath)) {
      throw new Error(`Attachment not found: ${fileName}`);
    }

    await unlink(attachmentPath);
    await this.handleAttachmentChange(cardKey, 'removed', fileName);
  }

  /**
   * Removes a module from the project cache and configuration.
   * @note that ModuleManager removes the actual files.
   * @param moduleName Module name to remove.
   */
  public async removeModule(moduleName: string) {
    const toBeRemovedTemplates = this.resources.moduleResourceNames(
      'templates',
      moduleName,
    );

    // First, remove template cards from the cache that are part of removed templates.
    for (const templateName of toBeRemovedTemplates) {
      this.cardCache.deleteCardsFromTemplate(templateName);
    }

    // Then, remove all module resources from cache
    this.resources.invalidateModule(moduleName);

    // Finally, remove module from project configuration
    await this.configuration.removeModule(moduleName);

    this.logger.info(`Removed module '${moduleName}'`);
  }

  /**
   * Removes resource from the resource cache.
   * @param name Name of the resource.
   */
  public removeResource(name: string) {
    this.resources.removeResource(name);
  }

  /**
   * Array of report names in the project.
   * @param from Defines where resources are collected from.
   * @returns array of report names in the project.
   */
  public reportNames(from: ResourcesFrom = ResourcesFrom.all): string[] {
    return this.resources
      .resources('reports', from)
      .map((item) => item.data?.name || '');
  }

  /**
   * Array of reports in the project.
   * @param from Defines where resources are collected from.
   * @returns array of reports in the project.
   */
  public reports(from: ResourcesFrom = ResourcesFrom.all): ReportResource[] {
    return this.resources.resources('reports', from);
  }

  /**
   * Returns handlebar files from reports.
   * @param from Defines where report handlebar files are collected from.
   * @returns handlebar files from reports.
   */
  public async reportHandlerBarFiles(from: ResourcesFrom = ResourcesFrom.all) {
    const reports = this.reports(from);
    const handleBarFiles: string[] = [];
    for (const report of reports) {
      handleBarFiles.push(...(await report.handleBarFiles()));
    }
    return handleBarFiles;
  }

  /**
   * Checks if a given resource exists in the project already.
   * @param name Valid name of resource.
   * @returns boolean, true if resource exists; false otherwise.
   */
  public resourceExists(name: string): boolean {
    return this.resources.resourceExists(name);
  }

  /**
   * Returns resource type name based on singular type name.
   * @param singular Singular type name (e.g. 'workflow')
   * @returns Actual type (plural e.g. 'workflows)
   */
  public resourceTypeFromSingular(singular: string): keyof ResourceMap {
    return this.resources.resourceTypeFromSingularType(singular);
  }

  /**
   * Returns type of resource.
   * @param name Name of resource.
   * @returns resource with inferred actual type.
   */
  public resourceType(name: string): keyof ResourceMap {
    return this.resources.extractResourceType(name);
  }

  /**
   * Overload to the above: Accept string name with explicit type
   * @param name Name of resource.
   * @param type Type of resource as a string that matches ResourceMap
   * @template T Resource type
   * @returns resource with inferred actual type.
   */
  public resourceByType<T extends keyof ResourceMap>(
    name: string,
    type: T,
  ): ResourceMap[T];

  /**
   * Overload to the above: Accept resource name
   * @param resourceName Name of resource as a resource name (prefix/type/identifier)
   * @template T Resource type
   * @returns resource with inferred actual type.
   */
  public resourceByType<T extends keyof ResourceMap>(
    resourceName: ResourceName,
  ): ResourceMap[T];

  /**
   * Returns type of resource.
   * @param nameOrResourceName Name of resource
   * @param type Name of resource as string matching Resource map element.
   * @template T Resource type as part of ResourceMap
   * @returns resource with inferred actual type.
   */
  public resourceByType<T extends keyof ResourceMap>(
    nameOrResourceName: string | ResourceName,
    type?: T,
  ): ResourceMap[T] {
    if (typeof nameOrResourceName === 'string') {
      if (!type) {
        throw new Error('Type parameter required when using string name');
      }
      return this.resources.resourceByType(nameOrResourceName, type);
    } else {
      return this.resources.resourceByName(nameOrResourceName);
    }
  }

  /**
   * Shows details of a project.
   * @returns details of a project.
   */
  public async show(): Promise<ProjectMetadata> {
    return {
      name: this.containerName,
      path: this.basePath,
      prefix: this.projectPrefix,
      hubs: this.configuration.hubs,
      modules: this.modules(),
      numberOfCards: (await this.listCards(CardLocation.projectOnly))[0].cards
        .length,
    };
  }

  /**
   * Show cards of a project.
   * @returns an array of all project cards in the project.
   */
  public showProjectCards(): Card[] {
    return this.showCards(this.paths.cardRootFolder);
  }

  /**
   * Returns cards from single template.
   * @param templateName Name of the template (supports both full names like 'decision/templates/decision' and short names like 'decision')
   * @returns List of cards from template.
   */
  public templateCards(templateName: string): Card[] {
    const templateCards = this.cardCache.getAllTemplateCards();
    return templateCards.filter((cachedCard) => {
      if (cachedCard.location === 'project') {
        return false;
      }
      return cachedCard.location === templateName;
    });
  }

  /**
   * Array of template names in the project.
   * @param from Defines where resources are collected from.
   * @returns array of all template names in the project.
   */
  public templateNames(from: ResourcesFrom = ResourcesFrom.all): string[] {
    return this.resources
      .resources('templates', from)
      .map((item) => item.data?.name || '');
  }

  /**
   * Array of templates in the project.
   * @param from Defines where resources are collected from.
   * @returns array of all templates in the project.
   */
  public templates(
    from: ResourcesFrom = ResourcesFrom.all,
  ): TemplateResource[] {
    return this.resources.resources('templates', from);
  }

  /**
   * Update a card's content.
   * @param cardKey card key to update.
   * @param content changed content
   */
  public async updateCardContent(cardKey: string, content: string) {
    const card = this.findCard(cardKey);
    card.content = content;

    // Update lastUpdated timestamp in metadata
    if (card.metadata) {
      card.metadata.lastUpdated = new Date().toISOString();
    }

    await this.saveCard(card);
    await this.handleCardChanged(card);
  }

  /**
   * Updates card metadata's single key.
   * @param cardKey card that is updated.
   * @param changedKey changed metadata key
   * @param newValue changed value for the key
   */
  public async updateCardMetadataKey(
    cardKey: string,
    changedKey: string,
    newValue: MetadataContent,
  ) {
    const card = this.findCard(cardKey);
    if (!card.metadata || card.metadata[changedKey] === newValue) {
      return;
    }

    const isRankChange = changedKey === 'rank';
    const previousPath = isRankChange ? card.path : undefined;
    const previousParent = isRankChange ? card.parent : undefined;

    const cardAsRecord: Record<string, MetadataContent> = card.metadata;
    cardAsRecord[changedKey] = newValue;

    const invalidCard = isTemplateCard(card)
      ? ''
      : await this.validateCard(card);
    if (invalidCard.length !== 0) {
      throw new Error(invalidCard);
    }

    const updated = await this.saveCardMetadata(card);
    if (!updated) return;

    // For rank changes, check if path changed (indicating a move)
    if (isRankChange) {
      const updatedCard = this.findCard(cardKey);
      if (updatedCard.path !== previousPath) {
        this.changeParent(updatedCard, previousParent);
      }
    }
  }

  /**
   * Updates the entire card in the card cache and handles any path/parent changes.
   * Also persists changes to content and metadata files.
   * @param card The card with updated information (path, parent, metadata, etc.)
   */
  public async updateCard(card: Card) {
    const cachedCard = this.cardCache.getCard(card.key);
    const pathChange = cachedCard && cachedCard.path !== card.path;

    if (pathChange) {
      this.changeParent(card, cachedCard.parent);
    }

    const metadataChanged =
      cachedCard &&
      JSON.stringify(cachedCard.metadata) !== JSON.stringify(card.metadata);
    if (metadataChanged) {
      await this.saveCardMetadata(card);
    }

    const contentChanged = cachedCard && cachedCard.content !== card.content;
    if (contentChanged) {
      await this.saveCardContent(card);
    }

    this.cardCache.updateCard(card.key, card);
    if (metadataChanged || contentChanged || pathChange) {
      await this.handleCardChanged(card);
    }
  }

  /**
   * Updates a card's metadata.
   * @param card affected card
   * @param changedMetadata changed content for the card
   */
  public async updateCardMetadata(card: Card, changedMetadata: CardMetadata) {
    card.metadata = changedMetadata;
    if (await this.saveCardMetadata(card)) {
      await this.handleCardChanged(card);
    }
  }

  /**
   * Updates a resource in cache with new data.
   * @param name Name of the resource.
   * @param instance New data. If omitted, will remove current instance data.
   */
  public updateResource(name: string, instance: unknown) {
    this.resources.updateResource(name, instance);
  }

  /**
   * Array of workflow names in the project.
   * @param from Defines where resources are collected from.
   * @returns array of workflow names in the project.
   */
  public workflowNames(from: ResourcesFrom = ResourcesFrom.all): string[] {
    return this.resources
      .resources('workflows', from)
      .map((item) => item.data?.name || '');
  }

  /**
   * Array of workflows in the project.
   * @param from Defines where resources are collected from.
   * @returns array of all workflows in the project.
   */
  public workflows(
    from: ResourcesFrom = ResourcesFrom.all,
  ): WorkflowResource[] {
    return this.resources.resources('workflows', from);
  }
}
