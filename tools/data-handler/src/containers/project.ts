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
  readdir,
  unlink,
  writeFile,
} from 'node:fs/promises';

import { CardContainer } from './card-container.js'; // base class

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
  type ProjectSettings,
  type Resource,
  type ResourceFolderType,
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
import {
  pathToResourceName,
  resourceName,
  type ResourceName,
  resourceNameToString,
} from '../utils/resource-utils.js';
import {
  ResourcesFrom,
  ResourceCollector,
} from './project/resource-collector.js';
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
  // Created resources are held in a cache.
  // In the cache, key is resource name, and data is resource metadata (as JSON).
  private createdResources = new Map<string, JSON>();
  private logger = getChildLogger({ module: 'Project' });
  private projectPaths: ProjectPaths;
  private resources: ResourceCollector;
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
    this.resources = new ResourceCollector(this);

    this.containerName = this.settings.name;
    // todo: implement project validation
    this.validator = Validate.getInstance();
    this.logger.info(
      { resourcesFolder: this.paths.resourcesFolder },
      'Collecting local resources',
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
            let resource;
            try {
              resource = pathToResourceName(
                this,
                join(this.paths.resourcesFolder, fileName),
              );
              if (!resource) {
                return;
              }
            } catch {
              // it wasn't a resource that changed, so ignore the change
              return;
            }
            const resourceName = `${resource.prefix}/${resource.type}/${resource.identifier}`;
            await this.replaceCacheValue(resourceName);
            this.resources.collectLocalResources();
          })();
        },
      );
    }
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
  private async findModule(moduleName: string): Promise<Resource | undefined> {
    return (await this.resources.resources('modules')).find(
      (item) => item.name === moduleName && item.path,
    );
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

  // Removes current version of a resource from the resource cache.
  // Then re-creates the resource with current data and caches the value again.
  // If the value wasn't in the cache before, it will be added.
  private async replaceCacheValue(resourceName: string) {
    if (this.createdResources.has(resourceName)) {
      // First, remove the old version from cache
      this.createdResources.delete(resourceName);
    }
    const resourceData = await this.resource(resourceName);
    if (resourceData) {
      this.createdResources.set(resourceName, resourceData as JSON);
    }
  }

  // Returns (local or all) resources of a given type.
  private async resourcesOfType(
    type: ResourceFolderType,
    from: ResourcesFrom = ResourcesFrom.localOnly,
  ): Promise<Resource[]> {
    return this.resources.resources(type, from);
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

  /**
   * Populate template cards into the card cache.
   */
  protected async populateTemplateCards(): Promise<void> {
    try {
      // Gets local & module templates
      const templateResources = await this.templates();
      const prefixes = await this.projectPrefixes();
      for (const template of templateResources) {
        try {
          this.validator.validResourceName(
            'templates',
            template.name,
            prefixes,
          );
        } catch (error) {
          this.logger.warn(
            { templateName: template.name, error },
            `Template name '${template.name}' does not follow required format, skipping`,
          );
          continue;
        }

        const templateResource = new TemplateResource(
          this,
          resourceName(template.name),
        );

        const templateObject = templateResource.templateObject();
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
   * Add a given 'resource' to the local resource arrays.
   * @param resource Resource to add.
   * @param data JSON data for the resource.
   */
  public addResource(resource: Resource, data: JSON) {
    this.resources.add(resource);
    this.createdResources.set(resource.name, data);
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
    const templates = await this.templates();
    for (const template of templates) {
      const templateResource = new TemplateResource(
        this,
        resourceName(template.name),
      );
      const templateObject = templateResource.templateObject();
      if (templateObject) {
        templateAttachments.push(...templateObject.attachments());
      }
    }
    return templateAttachments;
  }

  /**
   * Returns an array of all the calculation files (*.lp) in the project.
   * @param from Defines where resources are collected from.
   * @returns array of all calculation files in the project.
   */
  public async calculations(
    from: ResourcesFrom = ResourcesFrom.all,
  ): Promise<Resource[]> {
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
   * Returns path to a card's folder.
   * @param cardKey card key
   * @returns path to a card's folder.
   */
  public async cardFolder(cardKey: string): Promise<string> {
    const found = super.findCard(cardKey);
    if (found) {
      return found.path;
    }

    const templates = await this.templates();
    const templatePromises = templates.map((template) => {
      const templateObject = new TemplateResource(
        this,
        resourceName(template.name),
      ).templateObject();
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
   * Accessor for cards cache.
   * Used by template container (it needs to access project's cache, not their own instance).
   * @note Should not be used directly (other than Template).
   */
  public get cardsCache() {
    return this.cardCache;
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
   * Returns an array of all the card types in the project.
   * @param from Defines where resources are collected from.
   * @returns array of all card types in the project.
   */
  public async cardTypes(
    from: ResourcesFrom = ResourcesFrom.all,
  ): Promise<Resource[]> {
    return this.resources.resources('cardTypes', from);
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
  public collectModuleResources() {
    this.resources.moduleImported();
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
    return new TemplateResource(this, resourceName(template)).templateObject();
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
   * Returns an array of all the field types in the project.
   * @param from Defines where resources are collected from.
   * @returns array of all field types in the project.
   */
  public async fieldTypes(
    from: ResourcesFrom = ResourcesFrom.all,
  ): Promise<Resource[]> {
    return this.resources.resources('fieldTypes', from);
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
   * Returns specific card.
   * @param cardToFind Card key to find
   * @param details Defines which card details are included in the return values.
   * @returns specific card details, or undefined if card is not part of the project.
   */
  public findCard(cardToFind: string, details?: ProjectFetchCardDetails): Card {
    return super.findCard(cardToFind, details);
  }

  /**
   * Returns an array of all the graph models in the project.
   * @param from Defines where resources are collected from.
   * @returns array of all the graph models in the project.
   */
  public async graphModels(
    from: ResourcesFrom = ResourcesFrom.all,
  ): Promise<Resource[]> {
    return this.resources.resources('graphModels', from);
  }

  /**
   * Returns an array of all the graph views in the project.
   * @param from Defines where resources are collected from.
   * @returns array of all the graph views in the project.
   */
  public async graphViews(
    from: ResourcesFrom = ResourcesFrom.all,
  ): Promise<Resource[]> {
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
    this.collectModuleResources();
    await this.populateTemplateCards();
    this.logger.info(`Imported module '${module.name}'`);
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
   * Returns an array of all the link types in the project.
   * @param from Defines where resources are collected from.
   * @returns array of all link types in the project.
   */
  public async linkTypes(
    from: ResourcesFrom = ResourcesFrom.all,
  ): Promise<Resource[]> {
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
      const templates = await this.templates();
      for (const template of templates) {
        const templateObject = new TemplateResource(
          this,
          resourceName(template.name),
        ).templateObject();
        if (templateObject) {
          // todo: optimization - do all this in parallel
          const templateCards = templateObject.listCards();
          if (templateCards.length) {
            cardListContainer.push({
              name: template.name,
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
      const modulePath = join(module.path, module.name);
      const moduleConfig = await readJsonFile(
        join(modulePath, Project.projectConfigFileName),
      );
      return {
        name: moduleConfig.name,
        modules: moduleConfig.modules,
        hubs: moduleConfig.hubs,
        path: modulePath,
        cardKeyPrefix: moduleConfig.cardKeyPrefix,
        calculations: [
          ...(await this.resources.collectResourcesFromModules(
            'calculations',
            moduleName,
          )),
        ],
        cardTypes: [
          ...(await this.resources.collectResourcesFromModules(
            'cardTypes',
            moduleName,
          )),
        ],
        fieldTypes: [
          ...(await this.resources.collectResourcesFromModules(
            'fieldTypes',
            moduleName,
          )),
        ],
        graphModels: [
          ...(await this.resources.collectResourcesFromModules(
            'graphModels',
            moduleName,
          )),
        ],
        graphViews: [
          ...(await this.resources.collectResourcesFromModules(
            'graphViews',
            moduleName,
          )),
        ],
        linkTypes: [
          ...(await this.resources.collectResourcesFromModules(
            'linkTypes',
            moduleName,
          )),
        ],
        reports: [
          ...(await this.resources.collectResourcesFromModules(
            'reports',
            moduleName,
          )),
        ],
        templates: [
          ...(await this.resources.collectResourcesFromModules(
            'templates',
            moduleName,
          )),
        ],
        workflows: [
          ...(await this.resources.collectResourcesFromModules(
            'workflows',
            moduleName,
          )),
        ],
      };
    }
    return undefined;
  }

  /**
   * Returns list of modules in the project.
   * @returns list of modules in the project.
   */
  public async modules(): Promise<Resource[]> {
    return this.resources.resources('modules');
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
   * @todo - move the module prefix fetch to resource-collector.
   *        Make it use cached value that is only changed when  module is removed/imported.
   */
  public async projectPrefixes(): Promise<string[]> {
    const prefixes: string[] = [this.projectPrefix];
    let files;
    try {
      // TODO: Could be optimized so that prefixes are stored once fetched.
      files = await readdir(this.paths.modulesFolder, {
        withFileTypes: true,
        recursive: true,
      });
      const configurationFiles = files
        .filter((dirent) => dirent.isFile())
        .filter((dirent) => dirent.name === Project.projectConfigFileName);

      const configurationPromises = configurationFiles.map(async (file) => {
        const configuration = (await readJsonFile(
          join(file.parentPath, file.name),
        )) as ProjectSettings;
        return configuration.cardKeyPrefix;
      });

      const configurationPrefixes = await Promise.all(configurationPromises);
      prefixes.push(...configurationPrefixes);
    } catch (error) {
      this.logger.error({ error }, 'Failed to collect prefixes in use');
    }

    return prefixes;
  }

  /**
   * Removes a module from the project
   * @param module Module (name) to remove.
   */
  public async removeModule(moduleName: string) {
    const toBeRemovedTemplates = this.resources.moduleResources.resourceArray(
      'templates',
      moduleName,
    );
    // First, remove cards from the cache
    for (const template of toBeRemovedTemplates) {
      this.cardCache.deleteCardsFromTemplate(template.name);
    }

    // Then, remove module from project configuration
    await this.configuration.removeModule(moduleName);
    this.collectModuleResources();

    this.logger.info(`Removed module '${moduleName}'`);
  }

  /**
   * Removes a resource from Project.
   * @param resource Resource to remove.
   */
  public removeResource(resource: Resource) {
    // Template cards must be removed from the cache when resource is removed.
    if (resource.path.includes('templates')) {
      const templateName = resourceNameToString(resourceName(resource.name));
      this.cardCache.deleteCardsFromTemplate(templateName);
    }
    this.resources.remove(resource);
    this.createdResources.delete(resource.name);
  }

  /**
   * Array of reports in the project.
   * @param from Defines where resources are collected from.
   * @returns array of all reports in the project.
   */
  public async reports(
    from: ResourcesFrom = ResourcesFrom.all,
  ): Promise<Resource[]> {
    return this.resources.resources('reports', from);
  }

  /**
   * Returns handlebar files from reports.
   * @param from Defines where report handlebar files are collected from.
   * @returns handlebar files from reports.
   */
  public async reportHandlerBarFiles(from: ResourcesFrom = ResourcesFrom.all) {
    const reports = await this.reports(from);
    const handleBarFiles: string[] = [];
    for (const reportResourceName of reports) {
      const name = resourceName(reportResourceName.name);
      const report = new ReportResource(this, name);
      handleBarFiles.push(...(await report.handleBarFiles()));
    }
    return handleBarFiles;
  }

  /**
   * Returns metadata from a given resource
   * @param name Name of a resource
   * @returns Metadata from the resource.
   */
  public resource<Type>(name: string): Type | undefined {
    const resName = resourceName(name);
    if (this.createdResources.has(resourceNameToString(resName))) {
      const value = this.createdResources.get(
        resourceNameToString(resName),
      ) as unknown as Type;
      return value;
    }
    let resource = undefined;
    try {
      resource = Project.resourceObject(this, resName);
    } catch {
      return undefined;
    }
    const data = resource?.data as Type;
    if (!data) {
      return undefined;
    }
    return data;
  }

  /**
   * Returns resource cache.
   */
  public get resourceCache(): Map<string, JSON> {
    return this.createdResources;
  }

  /**
   * Checks if a given resource exists in the project already.
   * @param resourceType Type of resource as a string.
   * @param name Valid name of resource.
   * @returns boolean, true if resource exists; false otherwise.
   */
  public async resourceExists(
    resourceType: ResourceFolderType,
    name: string,
  ): Promise<boolean> {
    const resources = await this.resourcesOfType(
      resourceType,
      ResourcesFrom.all,
    );
    const resource = resources.find((item) => item.name === name);
    return resource !== undefined;
  }

  /**
   * Instantiates resource object from project with a resource name.
   * @note that this is memory based object only.
   *       To manipulate the resource (create files, delete files etc), use the resource object's API.
   * @param project Project from which resources are created from.
   * @param name Resource name
   * @throws if called with unsupported resource type.
   * @returns Created resource.
   */
  public static resourceObject(project: Project, name: ResourceName) {
    if (name.type === 'calculations') {
      return new CalculationResource(project, name);
    } else if (name.type === 'cardTypes') {
      return new CardTypeResource(project, name);
    } else if (name.type === 'fieldTypes') {
      return new FieldTypeResource(project, name);
    } else if (name.type === 'graphModels') {
      return new GraphModelResource(project, name);
    } else if (name.type === 'graphViews') {
      return new GraphViewResource(project, name);
    } else if (name.type === 'linkTypes') {
      return new LinkTypeResource(project, name);
    } else if (name.type === 'reports') {
      return new ReportResource(project, name);
    } else if (name.type === 'templates') {
      return new TemplateResource(project, name);
    } else if (name.type === 'workflows') {
      return new WorkflowResource(project, name);
    }
    throw new Error(
      `Unsupported resource type '${resourceNameToString(name)}'`,
    );
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
      modules: (await this.modules()).map((item) => item.name),
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
   * Array of templates in the project.
   * @param from Defines where resources are collected from.
   * @returns array of all templates in the project.
   */
  public async templates(
    from: ResourcesFrom = ResourcesFrom.all,
  ): Promise<Resource[]> {
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
   * Array of workflows in the project.
   * @param from Defines where resources are collected from.
   * @returns array of all workflows in the project.
   */
  public async workflows(
    from: ResourcesFrom = ResourcesFrom.all,
  ): Promise<Resource[]> {
    return this.resources.resources('workflows', from);
  }
}
