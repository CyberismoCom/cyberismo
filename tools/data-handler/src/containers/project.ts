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
import { ResourcesFrom } from './project/resource-cache.js';
import { ResourceHandler } from './project/resource-handler.js';
import { Validate } from '../commands/validate.js';
import { ContentWatcher } from './project/project-content-watcher.js';
import { getChildLogger } from '../utils/log-utils.js';

import type { Template } from './template.js';

import { ROOT } from '../utils/constants.js';

// Re-export this, so that classes that use Project do not need to have separate import.
export { ResourcesFrom };

/**
 * Options for Project initialization.
 * autoSave - If project configuration changes are saved automatically. Default true.
 * watchResourceChanges - If project refresh automatically to filesystem changes. Default false.
 */
export interface ProjectOptions {
  autoSave?: boolean;
  watchResourceChanges?: boolean;
}

/**
 * Represents project folder.
 */
export class Project extends CardContainer {
  public calculationEngine: CalculationEngine;
  private logger = getChildLogger({ module: 'Project' });
  private projectPaths: ProjectPaths;
  private resourceHandler: ResourceHandler;
  private resourceWatcher: ContentWatcher | undefined;
  private settings: ProjectConfiguration;
  private validator: Validate;

  constructor(
    path: string,
    private options: ProjectOptions = {
      autoSave: true,
      watchResourceChanges: false,
    },
  ) {
    const settings = new ProjectConfiguration(
      join(path, '.cards', 'local', Project.projectConfigFileName),
      options.autoSave ?? true,
    );
    super(path, settings.cardKeyPrefix);
    this.settings = settings;

    this.logger.info({ path }, 'Initializing project');

    this.calculationEngine = new CalculationEngine(this);
    this.projectPaths = new ProjectPaths(path);
    this.resourceHandler = new ResourceHandler(this);
    // todo: implement project validation
    this.validator = Validate.getInstance();

    this.logger.info(
      { name: this.settings.name },
      'Project initialization complete',
    );

    const ignoreRenameFileChanges = true;

    // Watch changes in .cards if there are multiple instances of Project being
    // run concurrently.
    if (this.options.watchResourceChanges) {
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
  // todo: could be moved to card-utils
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
      this.projectPrefixes(),
    );
    const invalidWorkFlow = await this.validator.validateWorkflowState(
      this,
      card,
    );

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
      const templateResources = this.resources.templates();
      const prefixes = this.projectPrefixes();
      const loadPromises = templateResources.map(async (template) => {
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
          return;
        }

        const templateObject = template.templateObject();
        const isCreated = templateObject && templateObject.isCreated();
        if (!templateObject || !isCreated) {
          return;
        }

        await this.cardCache.populateFromPath(
          templateObject.templateCardsFolder(),
          false,
        );
      });

      await Promise.all(loadPromises);

      // Once all templates have been fetched, build child-parent relationships.
      this.cardCache.populateChildrenRelationships();
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
      try {
        await copyFile(
          attachmentData,
          attachmentPath,
          fsConstants.COPYFILE_EXCL,
        );
      } catch {
        throw new Error(`Attachment file not found: ${attachmentData}`);
      }
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

    const templates = this.resources.templates();
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
    const templateResource = this.resources.byType(template, 'templates');
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
    this.resources.changedModules();
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
      const templates = this.resources.templates();
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
        this.resources.changedModules();
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
   * Returns all prefixes used in the project (project's own plus all from imported modules).
   * @returns all prefixes used in the project.
   */
  public projectPrefixes(): string[] {
    const prefixes: string[] = [this.projectPrefix];
    const moduleNames = this.configuration.modules.map((item) => item.name);
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

    try {
      await unlink(attachmentPath);
    } catch (error) {
      this.logger.error({ error }, 'Removing card attachment');
      throw new Error(`Attachment not found: ${fileName}`);
    }
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
    this.resources.removeModule(moduleName);

    // Finally, remove module from project configuration
    await this.configuration.removeModule(moduleName);

    this.logger.info(`Removed module '${moduleName}'`);
  }

  /**
   * Accessor for resource handler.
   * @returns Resource handler instance.
   */
  public get resources(): ResourceHandler {
    return this.resourceHandler;
  }

  /**
   * Shows details of a project.
   * @returns details of a project.
   */
  public async show(): Promise<ProjectMetadata> {
    return {
      name: this.settings.name,
      path: this.basePath,
      prefix: this.projectPrefix,
      hubs: this.configuration.hubs,
      modules: this.resources.moduleNames(),
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
}
