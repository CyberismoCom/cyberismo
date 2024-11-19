/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { basename, dirname, join, resolve, sep } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';

import {
  Card,
  CardAttachment,
  CardListContainer,
  CardMetadata,
  CardNameRegEx,
  FetchCardDetails,
  MetadataContent,
  ModuleSettings,
  ProjectMetadata,
  ProjectSettings,
  Resource,
  ResourceFolderType,
} from '../interfaces/project-interfaces.js';
import {
  CardType,
  FieldType,
  LinkType,
  Report,
  ReportMetadata,
  Workflow,
} from '../interfaces/resource-interfaces.js';
import { getFilesSync, pathExists } from '../utils/file-utils.js';
import { ProjectConfiguration } from '../project-settings.js';
import { ProjectPaths } from './project/project-paths.js';
import { readJsonFile } from '../utils/json.js';
import { Template } from './template.js';
import { Validate } from '../validate.js';
import { generateRandomString } from '../utils/random.js';

// base class
import { CardContainer } from './card-container.js';
import {
  ResourcesFrom,
  ResourceCollector,
} from './project/resource-collector.js';

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

  constructor(path: string) {
    super(path, '');

    this.settings = ProjectConfiguration.getInstance(
      join(path, '.cards', 'local', Project.projectConfigFileName),
    );
    this.projectPaths = new ProjectPaths(path, this.projectPrefix);
    this.resources = new ResourceCollector(
      this.projectPrefix,
      this.projectPaths,
    );

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

  // Reads card tree to memory. This is with minimal information (e.g no attachments, no content).
  private async readCardTreeToMemory(cardRootPath: string, cards?: Card[]) {
    // Finds card from already collected cards using filename path.
    function findCard(path: string, cards: Card[] | undefined) {
      return cards?.find((card) => card.key === basename(path));
    }

    // Filter out the schema validation files.
    let entries = await readdir(cardRootPath, { withFileTypes: true });
    entries = entries.filter((entry) => {
      return entry.name !== Project.schemaContentFile;
    });

    // Loop through all the found file entries and collect found cards.
    for (const entry of entries) {
      if (entry.isDirectory() && CardNameRegEx.test(entry.name)) {
        // Card directory (e.g. 'decision_11')
        cards?.push({
          key: entry.name,
          path: join(entry.parentPath, entry.name),
          children: [],
          attachments: [],
        });
        await this.readCardTreeToMemory(
          join(entry.parentPath, entry.name),
          cards,
        );
      } else if (entry.isDirectory() && entry.name === 'c') {
        // Subdirectory 'c' of card directory.
        const found = findCard(entry.parentPath, cards);
        if (found) {
          await this.readCardTreeToMemory(
            join(entry.parentPath, entry.name),
            found.children,
          );
        }
      } else if (entry.isFile() && entry.name === Project.cardMetadataFile) {
        // Metadata file in card directory.
        const found = findCard(entry.parentPath, cards);
        if (found) {
          found.metadata = (await readJsonFile(
            join(entry.parentPath, entry.name),
          )) as CardMetadata;
        }
      }
    }
  }

  /**
   * This function should be called after card is updated.
   * Updates lastUpdated metadata key.
   */
  private async onCardUpdate(cardKey: string) {
    return this.updateMetadataKey(
      cardKey,
      'lastUpdated',
      new Date().toISOString(),
    );
  }

  // Returns (local or all) resources of a given type.
  private async resourcesOfType(
    type: ResourceFolderType,
    from: ResourcesFrom = ResourcesFrom.localOnly,
  ): Promise<Resource[]> {
    if (type === 'calculation') return this.calculations(from);
    if (type === 'cardType') return this.cardTypes(from);
    if (type === 'fieldType') return this.fieldTypes(from);
    if (type === 'linkType') return this.linkTypes(from);
    if (type === 'module') return this.modules();
    if (type === 'report') return this.reports(from);
    if (type === 'template') return this.templates(from);
    if (type === 'workflow') return this.workflows(from);
    return [];
  }

  /**
   * Updates metadata key.
   * @param cardKey card that is updated.
   * @param changedKey changed metadata key
   * @param newValue changed value for the key
   * @returns true if metadata key was updated, false otherwise.
   */
  private async updateMetadataKey(
    cardKey: string,
    changedKey: string,
    newValue: MetadataContent,
  ) {
    const card = await this.findCard(this.basePath, cardKey, {
      metadata: true,
    });
    if (!card) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }

    if (!card.metadata || card.metadata[changedKey] === newValue) {
      return false;
    }
    const cardAsRecord: Record<string, MetadataContent> = card.metadata;
    cardAsRecord[changedKey] = newValue;

    const validCard = Project.isTemplateCard(card)
      ? ''
      : await this.validateCard(card);
    if (validCard.length !== 0) {
      throw new Error(validCard);
    }

    await this.saveCardMetadata(card);
    return true;
  }

  /**
   * Add a given 'resource' to the local resource arrays.
   * @param resource Resource to add.
   */
  public addResource(resource: Resource) {
    this.resources.add(resource);
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
    const cardPath = await this.cardFolder(cardKey);

    // Check if it is a template card.
    // todo: if 'cardFolder()' would return 'card', this could be Project.isTemplateCard()
    if (cardPath.includes('templates')) {
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
    cardDetails: FetchCardDetails,
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
      const templateObject = await this.createTemplateObject(template);
      const templateCard = templateObject
        ? await templateObject.findSpecificCard(cardKey)
        : undefined;
      return templateCard ? templateCard.path : '';
    });

    const templatePaths = await Promise.all(templatePromises);
    return templatePaths.find((path) => path !== '') || '';
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
   * Returns the content of a specific card type.
   * @param cardTypeName Name of card type to fetch. Can either be filename (including .json extension), or just name.
   * @param from Defines where resources are collected from.
   * @param skipSettingDefaultValues do not set default values to fields, if members are missing. This avoids doing unnecessary changes to card types.
   * @returns JSON content of card type, or undefined if the card type cannot be found.
   */
  public async cardType(
    cardTypeName: string,
    from: ResourcesFrom = ResourcesFrom.all,
    skipSettingDefaultValues: boolean = false,
  ): Promise<CardType | undefined> {
    const content = (await this.resources.resource(
      'cardTypes',
      cardTypeName,
      from,
    )) as unknown as CardType;
    if (!content) {
      return undefined;
    }
    if (content && content.customFields) {
      for (const item of content.customFields) {
        // Set "isEditable" if it is missing; default = true
        if (item.isEditable === undefined && !skipSettingDefaultValues) {
          item.isEditable = true;
        }
        // Fetch displayName from field type
        if (item.name) {
          const fieldType = await this.fieldType(item.name);
          if (fieldType) {
            if (item.displayName === undefined && !skipSettingDefaultValues)
              item.displayName = fieldType.displayName;
            if (item.description === undefined && !skipSettingDefaultValues)
              item.description = fieldType.fieldDescription;
          } else {
            continue;
          }
        } else {
          console.error(
            `Custom field '${item.name}' is missing mandatory 'name' in card type '${cardTypeName}'`,
          );
          return undefined;
        }
      }
    } else {
      content.customFields = [];
    }
    if (!content.alwaysVisibleFields) {
      content.alwaysVisibleFields = [];
    }
    if (!content.optionallyVisibleFields) {
      content.optionallyVisibleFields = [];
    }
    return content;
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
   * Creates a Template object. It is ensured that the template is part of project.
   * @param template Template resource (name + path)
   * @returns Template object, or undefined if template does not exist in the project.
   */
  public async createTemplateObject(
    template: Resource,
  ): Promise<Template | undefined> {
    template.name = Template.normalizedTemplateName(template.name);

    if (template.name === '' || !(await this.templateExists(template.name))) {
      return undefined;
    }

    const templateObject = new Template(this, template);
    await templateObject.create({ name: template.name });
    return templateObject;
  }

  /**
   * Creates a Template object. It is ensured that the template is part of project.
   * @param templateName Name of the template
   * @returns Template object, or undefined if templateName does not exist in the project.
   */
  public async createTemplateObjectByName(
    templateName: string,
  ): Promise<Template | undefined> {
    return this.createTemplateObject({ name: templateName });
  }

  /**
   * Returns specific fieldType metadata.
   * @param fieldTypeName Name of the fileType
   * @param from Defines where resources are collected from.
   * @returns fieldType metadata.
   */
  public async fieldType(
    fieldTypeName: string,
    from: ResourcesFrom = ResourcesFrom.all,
  ): Promise<FieldType | undefined> {
    return this.resources.resource(
      'fieldTypes',
      fieldTypeName,
      from,
    ) as unknown as FieldType;
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
   * @param cardKey Card key to find
   * @param details Defines which card details are included in the return values.
   * @returns specific card details, or undefined if card is not part of the project.
   */
  public async findSpecificCard(
    cardKey: string,
    details: FetchCardDetails = {},
  ): Promise<Card | undefined> {
    const projectCard = await super.findCard(
      this.paths.cardRootFolder,
      cardKey,
      details,
    );
    let templateCard;
    if (!projectCard) {
      const templates = await this.templates();
      for (const template of templates) {
        const templateObject = await this.createTemplateObject(template);
        // optimize: execute each find in template parallel
        if (templateObject) {
          templateCard = await templateObject.findSpecificCard(
            cardKey,
            details,
          );
          if (templateCard) {
            break;
          }
        }
      }
    }
    return projectCard ? projectCard : templateCard;
  }

  /**
   * Flattens card tree so that children are shown on same level regardless of nesting level.
   * @param array card tree
   * @returns flattened card tree.
   */
  public static flattenCardArray(array: Card[]): Card[] {
    const result: Card[] = [];
    array.forEach((item) => {
      //todo: for more generic utility, define details
      const { key, path, children, attachments, metadata } = item;
      result.push({ key, path, children, attachments, metadata });
      if (children) {
        result.push(...Project.flattenCardArray(children));
      }
    });
    return result;
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
   * Checks if given path is a project.
   * @param path Path to a project
   * @returns true, if in the given path there is a project; false otherwise
   */
  static isCreated(path: string): boolean {
    return pathExists(join(path, 'cardRoot'));
  }

  /**
   * Checks if given card is in some template.
   * @param card card object to check
   * @returns true if card exists in a template; false otherwise
   */
  static isTemplateCard(card: Card): boolean {
    return (
      card.path.includes(`${sep}templates${sep}`) ||
      card.path.includes(`${sep}modules${sep}`)
    );
  }

  /**
   * Returns whether card is a template card or not
   * @param cardKey card to check.
   * @todo: This is only used from 'remove'. Could it use the static checker?
   */
  public async isTemplateCard(cardKey: string): Promise<boolean> {
    const templateCards = await this.templateCards();
    return templateCards.find((card) => card.key === cardKey) != null;
  }

  /**
   * Returns specific link type path
   * @param linkTypeName Name of the linkType
   * @returns link type path.
   */
  public async linkTypePath(linkTypeName: string): Promise<string | undefined> {
    if (!linkTypeName) {
      return undefined;
    }
    if (!linkTypeName.endsWith('.json')) {
      linkTypeName += '.json';
    }
    const found = (await this.linkTypes()).find(
      (item) => item.name === linkTypeName && item.path,
    );

    if (!found || !found.path) {
      return undefined;
    }
    return join(found.path, basename(found.name));
  }

  /**
   * Returns specific link type metadata.
   * @param linkTypeName Name of the linkType
   * @param from Defines where resources are read from.
   * @returns link type metadata.
   */
  public async linkType(
    linkTypeName: string,
    from: ResourcesFrom = ResourcesFrom.all,
  ): Promise<LinkType | undefined> {
    return this.resources.resource(
      'linkTypes',
      linkTypeName,
      from,
    ) as unknown as LinkType;
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
   * Returns an array of all the cards in the project. Cards don't have content and nor metadata.
   * @param includeTemplateCards Whether or not to include cards in templates
   * @returns all cards in the project.
   */
  public async listAllCards(
    includeTemplateCards: boolean,
  ): Promise<CardListContainer[]> {
    const cardListContainer: CardListContainer[] = [];
    const projectCards = (await super.cards(this.paths.cardRootFolder)).map(
      (item) => item.key,
    );
    cardListContainer.push({
      name: this.projectName,
      type: 'project',
      cards: projectCards,
    });

    if (includeTemplateCards) {
      const templates = await this.templates();
      for (const template of templates) {
        const templateObject = await this.createTemplateObject(template);
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
   * Returns details of a certain module.
   * @param moduleName Name of the module.
   * @returns module details, or undefined if workflow cannot be found.
   */
  public async module(moduleName: string): Promise<ModuleSettings | undefined> {
    const module = await this.findModule(moduleName);
    if (module && module.path) {
      const modulePath = join(module.path, module.name);
      const moduleConfig = (await readJsonFile(
        join(modulePath, Project.projectConfigFileName),
      )) as ModuleSettings;
      return {
        name: moduleConfig.name,
        path: modulePath,
        cardKeyPrefix: moduleConfig.cardKeyPrefix,

        // resources:
        calculations: [
          ...(await this.resources.collectResourcesFromModules('calculations')),
        ],
        cardTypes: [
          ...(await this.resources.collectResourcesFromModules('cardTypes')),
        ],
        fieldTypes: [
          ...(await this.resources.collectResourcesFromModules('fieldTypes')),
        ],
        linkTypes: [
          ...(await this.resources.collectResourcesFromModules('linkTypes')),
        ],
        templates: [
          ...(await this.resources.collectResourcesFromModules('templates')),
        ],
        workflows: [
          ...(await this.resources.collectResourcesFromModules('workflows')),
        ],
        reports: [
          ...(await this.resources.collectResourcesFromModules('reports')),
        ],
      };
    }
    return undefined;
  }

  /**
   * Returns list of module names in the project.
   * @returns List of module names in the project.
   * @todo: Is this needed --> could be just modules() call?
   */
  public async moduleNames(): Promise<string[]> {
    const moduleNames: string[] = [];
    if (pathExists(this.paths.modulesFolder)) {
      const names = await readdir(this.paths.modulesFolder);
      if (names) {
        moduleNames.push(...names);
      }
    }
    return moduleNames;
  }

  /**
   * Returns path to a module.
   * @param moduleName Name of the module.
   * @returns path to a module.
   * @todo: Is this needed --> could be just module() call?
   */
  public async modulePath(moduleName: string): Promise<string | undefined> {
    const module = await this.findModule(moduleName);
    return module && module.path ? join(module.path, module.name) : undefined;
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
  public async newCardKey(): Promise<string> {
    const maxAttempts = 10;
    const base = 36;
    const length = 8;
    for (let i = 0; i < maxAttempts; i++) {
      // Create a key and check that there are no collisions with other keys in project
      const newKey = `${this.settings.cardKeyPrefix}_${generateRandomString(base, length)}`;
      const exists = await this.findSpecificCard(newKey);
      if (exists) continue;
      return newKey;
    }

    throw 'Could not generate unique card key';
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
   * Getter. Returns project prefix (part of card ID).
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
    if (pathExists(this.paths.modulesFolder)) {
      const files = await readdir(this.paths.modulesFolder, {
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
    }

    return prefixes;
  }

  /**
   * Returns details of certain report.
   * @param reportName Name of the report (either filename (including .json extension), or report name).
   * @param from Defines where resources are collected from.
   * @returns report configuration, or undefined if report cannot be found.
   */
  public async report(
    reportName: string,
    from: ResourcesFrom = ResourcesFrom.all,
  ): Promise<Report | undefined> {
    const found = (await this.resources.resources('reports', from)).find(
      (item) => item.name === reportName && item.path,
    );
    if (!found || !found.path) {
      return undefined;
    }
    const folder = join(found.path, basename(found.name));
    const metadata = (await this.resources.resource(
      'reports',
      reportName,
      from,
    )) as unknown as ReportMetadata;

    const schemaPath = join(folder, 'parameterSchema.json');

    return {
      name: '', //todo: fill in name
      metadata,
      contentTemplate: (
        await readFile(join(folder, 'index.adoc.hbs'))
      ).toString(),
      queryTemplate: (await readFile(join(folder, 'query.lp.hbs'))).toString(),
      schema: pathExists(schemaPath)
        ? JSON.parse((await readFile(schemaPath)).toString()) // Here we assume the file is actually a schema. Should be validated elsewhere
        : undefined,
    };
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
   * Removes a resource from Project.
   * @param resource Resource to remove.
   */
  public removeResource(resource: Resource) {
    this.resources.remove(resource);
  }

  /**
   * Checks if a given resource exists in the project already.
   * @param resourceType Type of resource as a string.
   * @param name Name of the resource in long format.
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
    const resource = resources.find(
      (item) => item.name === name + '.json' || item.name === name,
    );
    return resource !== undefined;
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
      numberOfCards: (await this.listAllCards(false))[0].cards.length,
    };
  }

  /**
   * Show cards of a project.
   * @returns an array of all project cards in the project.
   */
  public async showProjectCards(): Promise<Card[]> {
    const cards: Card[] = [];
    await this.readCardTreeToMemory(this.paths.cardRootFolder, cards);
    return cards;
  }

  /**
   * Returns details of certain template.
   * @param templateName Name of the template.
   * @param from Defines where resources are collected from.
   * @returns template resource details.
   */
  public async template(
    templateName: string,
    from: ResourcesFrom = ResourcesFrom.all,
  ): Promise<Resource | undefined> {
    return (
      (await this.templates(from)).find(
        (item) => item.name === templateName && item.path,
      ) || undefined
    );
  }

  /**
   * Returns all template cards from the project. This includes all module templates' cards.
   * @returns all the template cards from the project
   */
  public async templateCards(): Promise<Card[]> {
    const templates = await this.templates();
    const cards: Card[] = [];
    for (const template of templates) {
      const templateObject = await this.createTemplateObject(template);
      const templateCards = await templateObject?.cards();
      if (templateCards) {
        for (const card of templateCards) {
          cards.push(card);
        }
      }
    }
    return cards;
  }

  /**
   * Indicates if a template exists in a project.
   * @param templateName Name of a template
   * @returns true, if template named 'templateName' exists in project; false otherwise.
   */
  public async templateExists(templateName: string): Promise<boolean> {
    return this.resources.resourceExists('templates', templateName);
  }

  /**
   * Returns path from a template card
   * @param card template card item
   * @returns path of template card
   */
  public static templatePathFromCardPath(card: Card): string {
    if (Project.isTemplateCard(card)) {
      const parts = card.path.split(sep);
      const index = parts.indexOf('c');

      if (index !== -1) {
        return parts.slice(0, index).join(sep) + sep;
      }
    }

    return '';
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
    const card = await this.findCard(this.basePath, cardKey);
    if (!card) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }
    card.content = content;
    await this.saveCard(card);
    await this.onCardUpdate(cardKey);
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
    if (await this.updateMetadataKey(cardKey, changedKey, newValue)) {
      await this.onCardUpdate(cardKey);
    }
  }

  /**
   * Updates card metadata.
   * @param card affected card
   * @param changedMetadata changed content for the card
   * @param skipValidation Optional, if set does not validate the card
   */
  public async updateCardMetadata(
    card: Card,
    changedMetadata: CardMetadata,
    skipValidation: boolean = false,
  ) {
    card.metadata = changedMetadata;
    // In some mass operations cannot make single card validation while making the whole op (e.g. rename).
    if (skipValidation) {
      card.metadata.lastUpdated = new Date().toISOString();
      return await this.saveCardMetadata(card);
    } else {
      await this.saveCardMetadata(card);
      return this.onCardUpdate(card.key);
    }
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
    if (invalidCustomData.length === 0 && invalidWorkFlow.length === 0) {
      return '';
    }
    const errors: string[] = [];
    if (invalidCustomData.length > 0) {
      errors.push(invalidCustomData);
    }
    if (invalidWorkFlow.length > 0) {
      errors.push(invalidWorkFlow);
    }
    return errors.join('\n');
  }

  /**
   * Returns details of certain workflow.
   * @param workflowName Name of the workflow (either filename (including .json extension), or workflow name).
   * @param from Defines where resources are collected from.
   * @returns workflow configuration, or undefined if workflow cannot be found.
   */
  public async workflow(
    workflowName: string,
    from: ResourcesFrom = ResourcesFrom.all,
  ): Promise<Workflow | undefined> {
    return this.resources.resource(
      'workflows',
      workflowName,
      from,
    ) as unknown as Workflow;
  }

  /**
   * Finds initial state of a workflow.
   * @param workflow Workflow name
   * @returns workflow's initial state; undefined if either workflow cannot be found, or there is no initial state
   */
  public async workflowInitialState(
    workflow: string,
  ): Promise<string | undefined> {
    const workflowMetaData = await this.workflow(workflow, ResourcesFrom.all);

    if (!workflowMetaData) {
      return undefined;
    }

    // Accept both empty list and list with empty string item, as "initial state"
    const initialState = workflowMetaData.transitions.find(
      (item) => item.fromState.includes('') || item.fromState.length === 0,
    );
    return initialState?.toState;
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
