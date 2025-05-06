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
import { dirname, join, resolve, sep } from 'node:path';
import { readdir } from 'node:fs/promises';

import { CardContainer } from './card-container.js'; // base class
import {
  CardLocation,
  CardNameRegEx,
} from '../interfaces/project-interfaces.js';
import { findParentPath } from '../utils/card-utils.js';
import { getFilesSync, pathExists } from '../utils/file-utils.js';
import { generateRandomString } from '../utils/random.js';
import { isTemplateCard } from '../utils/card-utils.js';
import { ProjectConfiguration } from '../project-settings.js';
import { ProjectPaths } from './project/project-paths.js';
import { readJsonFile } from '../utils/json.js';
import { resourceName, resourceNameToString } from '../utils/resource-utils.js';
import {
  ResourcesFrom,
  ResourceCollector,
} from './project/resource-collector.js';
import { Validate } from '../commands/validate.js';

import { CardTypeResource } from '../resources/card-type-resource.js';
import { FieldTypeResource } from '../resources/field-type-resource.js';
import { GraphModelResource } from '../resources/graph-model-resource.js';
import { GraphViewResource } from '../resources/graph-view-resource.js';
import { LinkTypeResource } from '../resources/link-type-resource.js';
import { ReportResource } from '../resources/report-resource.js';
import { TemplateResource } from '../resources/template-resource.js';
import { WorkflowResource } from '../resources/workflow-resource.js';

import type { Dirent } from 'node:fs';
import type {
  Card,
  CardAttachment,
  CardListContainer,
  CardMetadata,
  FetchCardDetails,
  MetadataContent,
  ModuleContent,
  ModuleSetting,
  ProjectFetchCardDetails,
  ProjectMetadata,
  ProjectSettings,
  Resource,
  ResourceFolderType,
} from '../interfaces/project-interfaces.js';
import type { ResourceName } from '../utils/resource-utils.js';
import type { Template } from './template.js';

// Re-export this, so that classes that use Project do not need to have separate import.
export { ResourcesFrom };

/**
 * Represents project folder.
 */
export class Project extends CardContainer {
  private resources: ResourceCollector;
  private projectPaths: ProjectPaths;
  private settings: ProjectConfiguration;
  private validator: Validate;

  // Created resources are held in a cache.
  // In the cache, key is resource name, and data is resource metadata (as JSON).
  private createdResources = new Map<string, JSON>();

  constructor(path: string) {
    super(path, '');

    this.settings = new ProjectConfiguration(
      join(path, '.cards', 'local', Project.projectConfigFileName),
    );
    this.projectPaths = new ProjectPaths(path);
    this.resources = new ResourceCollector(this);

    this.containerName = this.settings.name;
    // todo: implement project validation
    this.validator = Validate.getInstance();
    this.resources.collectLocalResources();
  }

  // Finds specific module.
  private async findModule(moduleName: string): Promise<Resource | undefined> {
    return (await this.resources.resources('modules')).find(
      (item) => item.name === moduleName && item.path,
    );
  }

  // Returns (local or all) resources of a given type.
  // @todo: if this would be public, we could remove cardTypes(), fieldTypes(), ... and similar APIs
  private async resourcesOfType(
    type: ResourceFolderType,
    from: ResourcesFrom = ResourcesFrom.localOnly,
  ): Promise<Resource[]> {
    return this.resources.resources(type, from);
  }

  /**
   * Add a given 'resource' to the local resource arrays.
   * @param resource Resource to add.
   */
  public addResource(resource: Resource, data: JSON) {
    this.resources.add(resource);
    this.createdResources.set(resource.name, data);
  }

  /**
   * Returns an array of all the attachments in the project card's (excluding ones in templates).
   * @returns all attachments in the project.
   */
  public async attachments(): Promise<CardAttachment[]> {
    return super.attachments(this.paths.cardRootFolder);
  }

  /**
   * Returns an array of all the calculation files (*.lp) in the project.
   * @param from Defines where resources are collected from.
   * @returns array of all calculation files in the project.
   */
  public async calculations(
    from: ResourcesFrom = ResourcesFrom.localOnly,
  ): Promise<Resource[]> {
    return this.resources.resources('calculations', from);
  }

  /**
   * Returns path to card's attachment folder.
   * @param cardKey card key
   * @returns path to card's attachment folder.
   */
  public async cardAttachmentFolder(cardKey: string): Promise<string> {
    // Check if it is a template card.
    if (await this.isTemplateCard(cardKey)) {
      const cardPath = await this.cardFolder(cardKey);
      return join(cardPath, 'a');
    }

    const pathToProjectCard = this.pathToCard(cardKey);
    return pathToProjectCard
      ? join(this.paths.cardRootFolder, pathToProjectCard, 'a')
      : '';
  }

  /**
   * Returns details (as defined by cardDetails) of a card.
   * @param cardKey card key (project prefix and a number, e.g. test_1)
   * @param cardDetails which card details are returned.
   * @returns Card details, or undefined if the card cannot be found.
   */
  public async cardDetailsById(
    cardKey: string,
    cardDetails: ProjectFetchCardDetails,
  ): Promise<Card | undefined> {
    return this.findSpecificCard(cardKey, cardDetails);
  }

  /**
   * Returns path to card's folder.
   * @param cardKey card key
   * @returns path to card's folder.
   */
  public async cardFolder(cardKey: string): Promise<string> {
    const found = await super.findCard(this.paths.cardRootFolder, cardKey);
    if (found) {
      return found.path;
    }

    const templates = await this.templates();
    const templatePromises = templates.map(async (template) => {
      const templateObject = new TemplateResource(
        this,
        resourceName(template.name),
      ).templateObject();
      const templateCard = templateObject
        ? await templateObject.findSpecificCard(cardKey)
        : undefined;
      return templateCard ? templateCard.path : '';
    });

    const templatePaths = await Promise.all(templatePromises);
    return templatePaths.find((path) => path !== '') || '';
  }

  /**
   * Splits card path to parts. Returns the parts.
   * Returned parts are: prefix, card key, array of parents and template name. Template name is returned only for template cards.
   * @param cardPath path to a card
   * @returns card path logical parts
   * todo: if prefix would be parameter; this could be static, or util method
   */
  public cardPathParts(cardPath: string) {
    const pathParts = cardPath.split(sep);
    const cardKey = pathParts.at(pathParts.length - 1);
    const parents = [];
    let prefix = this.projectPrefix;
    let template = '';
    let startIndex = -1;
    let templatesNameIndex = -1;

    const cardRootIndex = pathParts.indexOf('cardRoot');
    const projectInternalsIndex = pathParts.indexOf('.cards');

    if (projectInternalsIndex === -1 && cardRootIndex >= 0) {
      startIndex = projectInternalsIndex;
    } else if (projectInternalsIndex >= 0 && cardRootIndex === -1) {
      const templatesIndex = pathParts.indexOf('templates');
      startIndex = templatesIndex;
      if (templatesIndex === -1) {
        throw new Error(
          `Invalid card path. Template card must have 'templates' in path`,
        );
      }
      const modulesIndex = pathParts.indexOf('modules');
      if (modulesIndex !== -1) {
        prefix = pathParts.at(modulesIndex + 1) || '';
      }
      templatesNameIndex = templatesIndex + 1;
      template = `${prefix}/templates/${pathParts.at(templatesNameIndex)}`;
    } else {
      throw new Error(`Card must be either project card, or template card`);
    }

    // Look for parents in the path.
    let previousWasParent = false;
    for (let index = startIndex; index <= pathParts.length; index++) {
      if (previousWasParent) {
        previousWasParent = false;
        parents.push(pathParts.at(index - 2));
      }
      const cardsSubFolder = pathParts.at(index) === 'c';
      const ignoreOrNotTemplatesParent =
        index - 1 !== templatesNameIndex || templatesNameIndex === -1;
      if (cardsSubFolder && ignoreOrNotTemplatesParent) {
        previousWasParent = true;
      }
    }

    return {
      cardKey: cardKey,
      parents: parents,
      prefix: prefix,
      template: template,
    };
  }

  /**
   * Returns an array of all the cards in the project. Cards have content and metadata
   * @param path Optional path from which to fetch the cards. Generally it is best to fetch from Project root, e.g. Project.cardRootFolder
   * @param details Which details to include in the cards; by default only "content" and "metadata" are included.
   * @returns all cards from the given path in the project.
   */
  public async cards(
    path: string = this.paths.cardRootFolder,
    details: FetchCardDetails = { content: true, metadata: true },
  ): Promise<Card[]> {
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
   * Updates all local resources.
   */
  public collectLocalResources() {
    this.resources.changed();
  }

  /**
   * Updates all imported module resources.
   */
  public async collectModuleResources() {
    await this.resources.moduleImported();
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
    const { template } = this.cardPathParts(card.path);
    return new TemplateResource(this, resourceName(template)).templateObject();
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
  public async findSpecificCard(
    cardToFind: string,
    details: ProjectFetchCardDetails = {},
  ): Promise<Card | undefined> {
    let card;

    if (
      details.location === CardLocation.projectOnly ||
      details.location === CardLocation.all ||
      !details.location
    ) {
      card = await super.findCard(
        this.paths.cardRootFolder,
        cardToFind,
        details,
      );
    }

    if (
      !card &&
      (details.location === CardLocation.templatesOnly ||
        details.location === CardLocation.all ||
        !details.location)
    ) {
      const templates = await this.templates();
      for (const template of templates) {
        const templateObject = new TemplateResource(
          this,
          resourceName(template.name),
        ).templateObject();
        if (!templateObject) continue;

        // optimize: execute each find in template parallel
        card = await templateObject.findSpecificCard(cardToFind, details);
        if (card) {
          break;
        }
      }
    }
    return card;
  }

  /**
   * Returns an array of all the graph models in the project.
   * @param from  Defines where resources are collected from.
   * @returns array of all the graph models in the project.
   */
  public async graphModels(
    from: ResourcesFrom = ResourcesFrom.all,
  ): Promise<Resource[]> {
    return this.resources.resources('graphModels', from);
  }

  /**
   * Returns an array of all the graph views in the project.
   * @param from  Defines where resources are collected from.
   * @returns array of all the graph views in the project.
   */
  public async graphViews(
    from: ResourcesFrom = ResourcesFrom.all,
  ): Promise<Resource[]> {
    return this.resources.resources('graphViews', from);
  }

  /**
   * Checks if a given card is part of this project.
   * @param cardKey card to check.
   * @returns true if a given card is found from project, false otherwise.
   */
  public hasCard(cardKey: string): boolean {
    return super.hasCard(cardKey, this.paths.cardRootFolder);
  }

  /**
   * Adds a module from project.
   * @param moduleName Name of the module
   */
  public async importModule(module: ModuleSetting) {
    // Add module as a dependency.
    await this.configuration.addModule(module);
    await this.collectModuleResources();
  }

  /**
   * Checks if given path is a project.
   * @param path Path to a project
   * @returns true, if in the given path there is a project; false otherwise
   */
  static isCreated(path: string): boolean {
    return pathExists(join(path, 'cardRoot'));
  }

  /**
   * Returns whether card is a template card or not
   * @param cardKey card to check.
   * @todo: This is only used from 'remove'. Could it use the static checker?
   */
  public async isTemplateCard(cardKey: string): Promise<boolean> {
    const templateCards = await this.allTemplateCards();
    return templateCards.find((card) => card.key === cardKey) != null;
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
   * @param includeCardsFrom Where to return cards from (project, templates, or both)
   * @returns all cards in the project.
   */
  public async listCards(
    cardsFrom: CardLocation = CardLocation.all,
  ): Promise<CardListContainer[]> {
    const cardListContainer: CardListContainer[] = [];
    if (
      cardsFrom === CardLocation.all ||
      cardsFrom === CardLocation.projectOnly
    ) {
      const projectCards = (await super.cards(this.paths.cardRootFolder)).map(
        (item) => item.key,
      );
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
          const templateCards = await templateObject.listCards();
          if (templateCards) {
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
   * @param includeCardsFrom Where to return cards from (project, templates, or both)
   * @returns Array of cardIDs.
   * @note that cardIDs are not sorted.
   */
  public async listCardIds(
    cardsFrom: CardLocation = CardLocation.all,
  ): Promise<Set<string>> {
    const promises: Promise<Set<string>>[] = [];
    if (
      cardsFrom === CardLocation.all ||
      cardsFrom === CardLocation.projectOnly
    ) {
      promises.push(
        super
          .cards(this.paths.cardRootFolder)
          .then((cards) => new Set(cards.map((card) => card.key))),
      );
    }
    if (
      cardsFrom === CardLocation.all ||
      cardsFrom === CardLocation.templatesOnly
    ) {
      promises.push(
        this.templates().then((templates) =>
          Promise.allSettled(
            templates.map(
              (template) =>
                new TemplateResource(this, resourceName(template.name)),
            ),
          )
            .then((results) =>
              results
                .filter(
                  (
                    result,
                  ): result is PromiseFulfilledResult<TemplateResource> =>
                    result.status === 'fulfilled' && result.value !== null,
                )
                .map((result) => result.value),
            )
            .then((templateObjects) =>
              Promise.allSettled(
                templateObjects.map((obj) => obj.templateObject().listCards()),
              ),
            )
            .then((results) => {
              const templateCardIds = new Set<string>();
              results
                .filter(
                  (result): result is PromiseFulfilledResult<Card[]> =>
                    result.status === 'fulfilled',
                )
                .forEach((result) => {
                  result.value.forEach((card) => templateCardIds.add(card.key));
                });
              return templateCardIds;
            }),
        ),
      );
    }
    const allCardIdSets = await Promise.all(promises);
    return new Set(allCardIdSets.flatMap((set) => [...set]));
  }

  /**
   * Returns details of a certain module.
   * @param moduleName Name of the module.
   * @returns module details, or undefined if workflow cannot be found.
   */
  public async module(moduleName: string): Promise<ModuleContent | undefined> {
    const module = await this.findModule(moduleName);
    if (module && module.path) {
      const modulePath = join(module.path, module.name);
      const moduleConfig = (await readJsonFile(
        join(modulePath, Project.projectConfigFileName),
      )) as ModuleContent;
      return {
        name: moduleConfig.name,
        modules: moduleConfig.modules,
        path: modulePath,
        cardKeyPrefix: moduleConfig.cardKeyPrefix,
        calculations: [
          ...(await this.resources.collectResourcesFromModules('calculations')),
        ],
        cardTypes: [
          ...(await this.resources.collectResourcesFromModules('cardTypes')),
        ],
        fieldTypes: [
          ...(await this.resources.collectResourcesFromModules('fieldTypes')),
        ],
        graphModels: [
          ...(await this.resources.collectResourcesFromModules('graphModels')),
        ],
        graphViews: [
          ...(await this.resources.collectResourcesFromModules('graphViews')),
        ],
        linkTypes: [
          ...(await this.resources.collectResourcesFromModules('linkTypes')),
        ],
        reports: [
          ...(await this.resources.collectResourcesFromModules('reports')),
        ],
        templates: [
          ...(await this.resources.collectResourcesFromModules('templates')),
        ],
        workflows: [
          ...(await this.resources.collectResourcesFromModules('workflows')),
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

    throw 'Could not generate unique card key';
  }

  /**
   * Returns an array of new unique card keys with project prefix (e.g. test_x649it4x).
   * Random part of string will be always 8 characters in base-36 (0-9a-z)
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
   * Getter. Returns a class that handles the project's paths.
   */
  public get paths(): ProjectPaths {
    return this.projectPaths;
  }

  /**
   * Returns full path to a given card.
   * @param cardKey card to check path for.
   * @returns path to a given card.
   */
  public pathToCard(cardKey: string): string {
    const allFiles = getFilesSync(this.paths.cardRootFolder);
    const cardIndexJsonFile = join(cardKey, Project.cardMetadataFile);
    const foundFile = allFiles.find((file) => file.includes(cardIndexJsonFile));
    return foundFile ? dirname(foundFile) : '';
  }

  /**
   * Getter. Returns project name.
   */
  public get projectName(): string {
    return this.settings.name;
  }

  /**
   * Getter. Returns project prefix.
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
    } catch {
      // do nothing if readdir throws
    }

    return prefixes;
  }

  /**
   * Removes a module from project.
   * @param moduleName Name of the module
   */
  public async removeModule(moduleName: string) {
    await this.configuration.removeModule(moduleName);
    await this.collectModuleResources();
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
   * Removes a resource from Project.
   * @param resource Resource to remove.
   */
  public removeResource(resource: Resource) {
    this.resources.remove(resource);
    this.createdResources.delete(resource.name);
  }

  /**
   * Returns metadata from a given resource
   * @param name Name of a resource
   * @returns Metadata from the resource.
   */
  public async resource<Type>(name: string): Promise<Type | undefined> {
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
    if (name.type === 'cardTypes') {
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
      modules: (await this.modules()).map((item) => item.name),
      numberOfCards: (await this.listCards(CardLocation.projectOnly))[0].cards
        .length,
    };
  }

  /**
   * Show cards of a project.
   * @returns an array of all project cards in the project.
   */
  public async showProjectCards(): Promise<Card[]> {
    const cards: Card[] = [];
    const cardPathMap = new Map<string, Card>();
    const entries = await readdir(this.paths.cardRootFolder, {
      withFileTypes: true,
      recursive: true,
    });

    // Checks if Dirent folder is a card folder
    function cardFolder(
      entry: Dirent,
      cardPathMap: Map<string, Card>,
    ): Card | undefined {
      const fullPath = join(entry.parentPath, entry.name);
      if (!cardPathMap.has(fullPath)) {
        const newCard: Card = {
          key: entry.name,
          path: fullPath,
          children: [],
          attachments: [],
        };
        cardPathMap.set(fullPath, newCard);
        return newCard;
      }
    }

    // Process card directories first
    entries
      .filter((entry) => entry.isDirectory() && CardNameRegEx.test(entry.name))
      .forEach((entry) => {
        const card = cardFolder(entry, cardPathMap);
        if (card) cards.push(card);
      });

    // Process metadata files in parallel
    await Promise.all(
      entries
        .filter(
          (entry) => entry.isFile() && entry.name === Project.cardMetadataFile,
        )
        .map(async (entry) => {
          const parentCard = cardPathMap.get(entry.parentPath);
          if (!parentCard) return;
          parentCard.metadata = (await readJsonFile(
            join(entry.parentPath, entry.name),
          )) as CardMetadata;
        }),
    );

    // Finally, build the card hierarchy
    Array.from(cardPathMap.entries()).map(([cardPath, card]) => {
      const parentPath = findParentPath(cardPath);
      if (!parentPath) return;
      const parentCard = cardPathMap.get(parentPath);
      if (!parentCard) return;

      parentCard.children.push(card);
      const index = cards.indexOf(card);
      if (index > -1) {
        cards.splice(index, 1);
      }
    });
    return cards;
  }

  /**
   * Returns all template cards from the project. This includes all module templates' cards.
   * @param cardDetails which details to fetch. Optional.
   * @returns all the template cards from the project
   */
  public async allTemplateCards(
    cardDetails?: FetchCardDetails,
  ): Promise<Card[]> {
    const templates = await this.templates();
    const cards: Card[] = [];
    for (const template of templates) {
      const templateCards = await this.templateCards(
        template.name,
        cardDetails,
      );
      if (templateCards) cards.push(...templateCards);
    }
    return cards;
  }

  /**
   * Returns cards from single template.
   * @param templateName Name of the template
   * @param cardDetails Card information
   * @returns List of cards from template.
   */
  public async templateCards(
    templateName: string,
    cardDetails?: FetchCardDetails,
  ): Promise<Card[]> {
    const templateObject = new TemplateResource(
      this,
      resourceName(templateName),
    ).templateObject();
    return await templateObject?.cards('', cardDetails);
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
   * Update card content.
   * @param cardKey card's ID that is updated.
   * @param content changed content
   */
  public async updateCardContent(cardKey: string, content: string) {
    const card = await this.findCard(this.basePath, cardKey, {
      metadata: true,
      content: true,
    });
    if (!card) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }
    card.content = content;
    await this.saveCard(card);
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
    const templateCard = await this.isTemplateCard(cardKey);
    const card = await this.findCard(
      templateCard ? this.paths.templatesFolder : this.paths.cardRootFolder,
      cardKey,
      {
        metadata: true,
      },
    );
    if (!card) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }

    if (!card.metadata || card.metadata[changedKey] === newValue) {
      return;
    }
    const cardAsRecord: Record<string, MetadataContent> = card.metadata;
    cardAsRecord[changedKey] = newValue;

    const invalidCard = isTemplateCard(card)
      ? ''
      : await this.validateCard(card);
    if (invalidCard.length !== 0) {
      throw new Error(invalidCard);
    }

    await this.saveCardMetadata(card);
  }

  /**
   * Updates card metadata.
   * @param card affected card
   * @param changedMetadata changed content for the card
   */
  public async updateCardMetadata(card: Card, changedMetadata: CardMetadata) {
    card.metadata = changedMetadata;
    return this.saveCardMetadata(card);
  }

  /**
   * Validates that card's data is valid.
   * @param card Card to validate.
   */
  public async validateCard(card: Card): Promise<string> {
    const invalidCustomData = await this.validator.validateCustomFields(
      this,
      card,
    );
    const invalidWorkFlow = await this.validator.validateWorkflowState(
      this,
      card,
    );

    const invalidLabels = await this.validator.validateCardLabels(card);
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
