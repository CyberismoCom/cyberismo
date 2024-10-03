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
import { Dirent, readdirSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';

import {
  Card,
  CardAttachment,
  CardListContainer,
  CardMetadata,
  CardNameRegEx,
  CardType,
  FetchCardDetails,
  FieldTypeDefinition,
  LinkType,
  MetadataContent,
  ModuleSettings,
  ProjectMetadata,
  ProjectSettings,
  Report,
  ReportMetadata,
  Resource,
  ResourceFolderType,
  WorkflowMetadata,
} from '../interfaces/project-interfaces.js';
import { getFilesSync, pathExists } from '../utils/file-utils.js';
import { ProjectConfiguration } from '../project-settings.js';
import { ProjectPaths } from './project/project-paths.js';
import { readJsonFile } from '../utils/json.js';
import { Template } from './template.js';
import { Validate } from '../validate.js';
import { generateRandomString } from '../utils/random.js';

// base class
import { CardContainer } from './card-container.js';

/**
 * Represents project folder.
 */
export class Project extends CardContainer {
  private projectPaths: ProjectPaths;
  private settings: ProjectConfiguration;
  private validator: Validate;

  private localCalculations: Resource[] = [];
  private localCardTypes: Resource[] = [];
  private localFieldTypes: Resource[] = [];
  private localLinkTypes: Resource[] = [];
  private localTemplates: Resource[] = [];
  private localWorkflows: Resource[] = [];
  private localReports: Resource[] = [];

  constructor(path: string) {
    super(path, '');

    this.settings = ProjectConfiguration.getInstance(this.projectSettingFile);
    this.projectPaths = new ProjectPaths(path, this.projectPrefix);
    this.containerName = this.settings.name;
    // todo: implement project validation
    this.validator = Validate.getInstance();

    this.localCalculations = this.resourcesSync('calculation', 'file');
    this.localCardTypes = this.resourcesSync('cardType', 'file');
    this.localFieldTypes = this.resourcesSync('fieldType', 'file');
    this.localLinkTypes = this.resourcesSync('linkType', 'file');
    this.localTemplates = this.resourcesSync('template', 'folder');
    this.localWorkflows = this.resourcesSync('workflow', 'file');
    this.localReports = this.resourcesSync('report', 'folder');
  }

  // Add resources to an array.
  private async addResourcesFromModules(
    moduleFolders: Dirent[],
    requestedType: string,
  ): Promise<Resource[]> {
    const collectedResources: Resource[] = [];
    const resourceIsADirectory = requestedType === 'templates' ? true : false;
    for (const module of moduleFolders) {
      if (requestedType === 'modules') {
        collectedResources.push(...moduleFolders);
      } else {
        const resourceFolder = join(
          this.modulesFolder,
          module.name,
          requestedType,
        );
        if (!pathExists(resourceFolder)) {
          // If certain resource type does not exist in this module, skip to the next one.
          continue;
        }
        const files = await readdir(resourceFolder, { withFileTypes: true });
        const filteredFiles = resourceIsADirectory
          ? files.filter((item) => item.isDirectory())
          : files.filter(
              (item) =>
                item.name !== Project.schemaContentFile &&
                item.name !== '.gitkeep',
            );

        filteredFiles.forEach((item) => {
          item.name = `${module.name}/${requestedType}/${item.name}`;
          collectedResources.push({ name: item.name, path: item.path });
        });
      }
    }
    return collectedResources;
  }

  // Collect resources from modules
  private async collectResourcesFromModules(type: string): Promise<Resource[]> {
    if (!pathExists(this.modulesFolder)) {
      return [];
    }

    const moduleDirectories = await readdir(this.modulesFolder, {
      withFileTypes: true,
    });
    const modules = moduleDirectories.filter((item) => item.isDirectory());

    return [...(await this.addResourcesFromModules(modules, type))];
  }

  // Finds specific module.
  private async findSpecificModule(
    moduleName: string,
  ): Promise<Resource | undefined> {
    const found = (await this.collectResourcesFromModules('modules')).find(
      (item) => item.name === moduleName,
    );
    if (!found || !found.path) {
      return undefined;
    }
    return found;
  }

  // Returns path to project configuration.
  private get projectSettingFile(): string {
    return join(this.resourcesFolder, Project.projectConfigFileName);
  }

  // Reads card tree to memory. This is with minimal information (e.g no attachments, no content).
  // todo: combine with function of same in Export; add here booleans 'include content', 'include attachments'
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
          path: join(entry.path, entry.name),
          children: [],
        });
        await this.readCardTreeToMemory(join(entry.path, entry.name), cards);
      } else if (entry.isDirectory() && entry.name === 'c') {
        // Subdirectory 'c' of card directory.
        const found = findCard(entry.path, cards);
        if (found) {
          await this.readCardTreeToMemory(
            join(entry.path, entry.name),
            found.children,
          );
        }
      } else if (entry.isFile() && entry.name === Project.cardMetadataFile) {
        // Metadata file in card directory.
        const found = findCard(entry.path, cards);
        if (found) {
          found.metadata = (await readJsonFile(
            join(entry.path, entry.name),
          )) as CardMetadata;
        }
      }
    }
  }

  // Collects certain kinds of resources.
  private resourcesSync(
    type: ResourceFolderType,
    requirement: string,
  ): Resource[] {
    const resourceFolder: string = this.paths.resourcePath(type);

    const resources: Resource[] = [];
    if (!pathExists(resourceFolder)) {
      return [];
    }
    const entries = readdirSync(resourceFolder, { withFileTypes: true });
    resources.push(
      ...entries
        .filter((entry) => {
          return !(entry.isFile() && entry.name === Project.schemaContentFile);
        })
        .filter((entry) => {
          return !(entry.isFile() && entry.name === '.gitkeep');
        })
        .filter((entry) => {
          return requirement === 'folder'
            ? entry.isDirectory()
            : requirement === 'file'
              ? entry.isFile()
              : false;
        })
        .map((entry) => {
          return {
            name: `${this.projectPrefix}/${type}s/${entry.name}`,
            path: entry.path,
          };
        }),
    );

    return resources;
  }

  // Returns (local or all) resources of a given type.
  private async resourcesOfType(
    type: ResourceFolderType,
    localOnly: boolean = true,
  ): Promise<Resource[]> {
    if (type === 'cardType') return this.cardTypes(localOnly);
    if (type === 'fieldType') return this.fieldTypes(localOnly);
    if (type === 'linkType') return this.linkTypes(localOnly);
    if (type === 'template') return this.templates(localOnly);
    if (type === 'workflow') return this.workflows(localOnly);
    if (type === 'module') return this.modules();
    if (type === 'calculation') return this.calculations(localOnly);
    return [];
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

    const validCard = Project.isTemplateCard(card)
      ? ''
      : await this.validateCard(card);
    if (validCard.length !== 0) {
      throw new Error(`Card '${cardKey}' is not valid! ${validCard}`);
    }

    if (!card.metadata || card.metadata[changedKey] === newValue) {
      return false;
    }
    const cardAsRecord: Record<string, MetadataContent> = card.metadata;
    cardAsRecord[changedKey] = newValue;
    await this.saveCardMetadata(card);
    return true;
  }

  /**
   * Returns an array of all the attachments in the project card's (excluding ones in templates).
   * @returns all attachments in the project.
   */
  public async attachments(): Promise<CardAttachment[]> {
    return super.attachments(this.cardRootFolder);
  }

  /**
   * Getter. Returns path to main level calculations folder
   */
  public get calculationFolder(): string {
    return join(this.basePath, '.calc');
  }

  /**
   * Getter. Returns path to project local calculations folder
   */
  public get calculationProjectFolder(): string {
    return this.projectPaths.calculationProjectFolder;
  }

  /**
   * Returns an array of all the calculation files (*.lp) in the project.
   * @param {boolean} localOnly Return local calculations, or all calculations (includes module calculations)
   * @returns array of all calculation files in the project.
   */
  public async calculations(localOnly: boolean = true): Promise<Resource[]> {
    const moduleCalculations =
      await this.collectResourcesFromModules('calculations');
    return localOnly
      ? this.localCalculations
      : [...this.localCalculations, ...moduleCalculations];
  }

  /**
   * Returns path to card's attachment folder.
   * @param {string} cardKey card key
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
      ? join(this.cardRootFolder, pathToProjectCard, 'a')
      : '';
  }

  /**
   * Returns details (as defined by cardDetails) of a card.
   * @param {string} cardKey card key (project prefix and a number, e.g. test_1)
   * @param {FetchCardDetails} cardDetails which card details are returned.
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
   * @param {string} cardKey card key
   * @returns path to card's folder.
   */
  public async cardFolder(cardKey: string): Promise<string> {
    const found = await super.findCard(this.cardRootFolder, cardKey);
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
   * Getter. Returns path to card root.
   */
  public get cardRootFolder(): string {
    return join(this.basePath, 'cardRoot');
  }

  /**
   * Returns an array of all the cards in the project. Cards have content and metadata
   * @param {string} path Optional path from which to fetch the cards. Generally it is best to fetch from Project root, e.g. Project.cardRootFolder
   * @param {string} details Which details to include in the cards; by default only "content" and "metadata" are included.
   * @returns all cards from the given path in the project.
   */
  public async cards(
    path: string = this.cardRootFolder,
    details: FetchCardDetails = { content: true, metadata: true },
  ): Promise<Card[]> {
    return super.cards(path, details);
  }

  /**
   * Returns the content of a specific card type.
   * @param {string} cardTypeName Name of card type to fetch. Can either be filename (including .json extension), or just name.
   * @returns JSON content of card type, or undefined if the card type cannot be found.
   */
  public async cardType(
    cardTypeName?: string,
    skipDefaults: boolean = false,
  ): Promise<CardType | undefined> {
    if (!cardTypeName) return undefined;
    if (!cardTypeName.endsWith('.json')) {
      cardTypeName += '.json';
    }
    const found = (await this.cardTypes()).find(
      (item) => item.name === cardTypeName && item.path,
    );
    if (!found || !found.path) {
      return undefined;
    }
    // todo: somehow should automatically fill-in 'default' values.
    const content = (await readJsonFile(
      join(found.path, basename(found.name)),
    )) as CardType;
    if (content.customFields && !skipDefaults) {
      for (const item of content.customFields) {
        // Set "isEditable" if it is missing; default = true
        if (item.isEditable === undefined) {
          item.isEditable = true;
        }
        // Fetch displayName from field type
        if (item.name) {
          const fieldType = await this.fieldType(item.name);
          if (fieldType) {
            if (item.displayName === undefined)
              item.displayName = fieldType.displayName;
            if (item.description === undefined)
              item.description = fieldType.fieldDescription;
          } else {
            console.error(
              `Missing fieldType '${item.name}' in cardType '${cardTypeName}'`,
            );
            continue;
          }
        } else {
          console.error(
            `Custom field '${item.name}' is missing mandatory 'name' in cardType '${cardTypeName}'`,
          );
          return undefined;
        }
      }
    }
    return content;
  }

  /**
   * Returns an array of all the card types in the project.
   * @param {boolean} localOnly Return local card types, or all card types (includes module card types)
   * @returns array of all card types in the project.
   */
  public async cardTypes(localOnly: boolean = false): Promise<Resource[]> {
    const moduleCardTypes = await this.collectResourcesFromModules('cardTypes');
    return localOnly
      ? this.localCardTypes
      : [...this.localCardTypes, ...moduleCardTypes];
  }

  /**
   * Getter. Returns path to 'cardTypes' folder.
   */
  public get cardTypesFolder(): string {
    return this.projectPaths.cardTypesFolder;
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
   * @param {resource} template Template resource (name + path)
   * @returns Template object, or undefined if template does not exist in the project.
   */
  public async createTemplateObject(
    template: Resource,
  ): Promise<Template | undefined> {
    template.name = Template.normalizedTemplateName(template.name);

    if (template.name === '' || !(await this.templateExists(template.name))) {
      return undefined;
    }

    const templateObject = new Template(this.basePath, template, this);
    await templateObject.create({});
    return templateObject;
  }

  /**
   * Creates a Template object. It is ensured that the template is part of project.
   * @param {string} templateName Name of the template
   * @returns Template object, or undefined if templateName does not exist in the project.
   */
  public async createTemplateObjectByName(
    templateName: string,
  ): Promise<Template | undefined> {
    return this.createTemplateObject({ name: templateName });
  }

  /**
   * Returns specific fieldType metadata.
   * @param {string} fieldTypeName Name of the fileType
   * @returns fieldType metadata.
   */
  public async fieldType(
    fieldTypeName: string,
  ): Promise<FieldTypeDefinition | undefined> {
    if (!fieldTypeName) {
      return undefined;
    }
    if (!fieldTypeName.endsWith('.json')) {
      fieldTypeName += '.json';
    }
    const found = (await this.fieldTypes()).find(
      (item) => item.name === fieldTypeName && item.path,
    );

    if (!found || !found.path) {
      return undefined;
    }
    const file = (await readJsonFile(
      join(found.path, basename(found.name)),
    )) as FieldTypeDefinition;
    return file;
  }

  /**
   * Returns an array of all the field types in the project.
   * @param {boolean} localOnly Return local field types, or all field types (includes module field types)
   * @returns array of all field types in the project.
   */
  public async fieldTypes(localOnly: boolean = false): Promise<Resource[]> {
    const moduleFieldTypes =
      await this.collectResourcesFromModules('fieldTypes');
    return localOnly
      ? this.localFieldTypes
      : [...this.localFieldTypes, ...moduleFieldTypes];
  }

  /**
   * Returns path to 'fieldTypes' folder.
   * @returns path to 'fieldTypes' folder.
   */
  public get fieldTypesFolder(): string {
    return this.projectPaths.fieldTypesFolder;
  }

  /**
   * Finds root of a project
   * @param {string} path Path where to start looking for the project root.
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
   * @param {string} cardKey Card key to find
   * @param {FetchCardDetails} details Defines which card details are included in the return values.
   * @returns specific card details, or undefined if card is not part of the project.
   */
  public async findSpecificCard(
    cardKey: string,
    details: FetchCardDetails = {},
  ): Promise<Card | undefined> {
    const projectCard = await super.findCard(
      this.cardRootFolder,
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
   * @param {card[]} array card tree
   * @returns flattened card tree.
   */
  public static flattenCardArray(array: Card[]) {
    const result: Card[] = [];
    array.forEach((item) => {
      //todo: for more generic utility, define details
      const { key, path, children, metadata } = item;
      result.push({ key, path, metadata });
      if (children) {
        result.push(...Project.flattenCardArray(children));
      }
    });
    return result;
  }

  /**
   * Checks if a given card is part of this project.
   * @param {string} cardKey card to check.
   * @returns true if a given card is found from project, false otherwise.
   */
  public hasCard(cardKey: string): boolean {
    return super.hasCard(cardKey, this.cardRootFolder);
  }

  /**
   * Checks if given path is a project.
   * @param {string} path Path to a project
   * @returns true, if in the given path there is a project; false otherwise
   */
  static isCreated(path: string): boolean {
    return pathExists(join(path, 'cardRoot'));
  }

  /**
   * Checks if given card is in some template.
   * @param {Card} card card object to check
   * @returns true if card exists in a template; false otherwise
   */
  static isTemplateCard(card: Card): boolean {
    return (
      card.path.includes(`${sep}templates${sep}`) ||
      card.path.includes(`${sep}modules${sep}`)
    );
  }

  /**
   * Returns specific link type path
   * @param {string} linkTypeName Name of the linkType
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
   * @param {string} linkTypeName Name of the linkType
   * @returns link type metadata.
   */
  public async linkType(linkTypeName: string): Promise<LinkType | undefined> {
    const path = await this.linkTypePath(linkTypeName);
    if (!path) {
      return undefined;
    }
    return readJsonFile(path);
  }
  /**
   * Returns an array of all the link types in the project.
   * @param {boolean} localOnly Return local link types, or all link types (includes module link types)
   * @returns array of all link types in the project.
   */
  public async linkTypes(localOnly: boolean = false): Promise<Resource[]> {
    const moduleLinkTypes = await this.collectResourcesFromModules('linkTypes');
    return localOnly
      ? this.localLinkTypes
      : [...this.localLinkTypes, ...moduleLinkTypes];
  }

  /**
   * Returns path to 'link types' folder.
   * @returns path to 'link types' folder.
   */
  public get linkTypesFolder(): string {
    return this.projectPaths.linkTypesFolder;
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
    const projectCards = (await super.cards(this.cardRootFolder)).map(
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
   * @param {string} moduleName Name of the module.
   * @returns module details, or undefined if workflow cannot be found.
   */
  public async module(moduleName: string): Promise<ModuleSettings | undefined> {
    const module = await this.findSpecificModule(moduleName);
    if (module && module.path) {
      const moduleNameAndPath = join(module.path, module.name);
      const moduleConfig = (await readJsonFile(
        join(moduleNameAndPath, Project.projectConfigFileName),
      )) as ModuleSettings;
      return {
        name: moduleConfig.name,
        path: moduleNameAndPath,
        cardKeyPrefix: moduleConfig.cardKeyPrefix,
        // resources:
        calculations: [
          ...(await this.collectResourcesFromModules('calculations')).map(
            (item) => item.name,
          ),
        ],
        cardTypes: [
          ...(await this.collectResourcesFromModules('cardTypes')).map(
            (item) => item.name,
          ),
        ],
        fieldTypes: [
          ...(await this.collectResourcesFromModules('fieldTypes')).map(
            (item) => item.name,
          ),
        ],
        linkTypes: [
          ...(await this.collectResourcesFromModules('linkTypes')).map(
            (item) => item.name,
          ),
        ],
        templates: [
          ...(await this.collectResourcesFromModules('templates')).map(
            (item) => item.name,
          ),
        ],
        workflows: [
          ...(await this.collectResourcesFromModules('workflows')).map(
            (item) => item.name,
          ),
        ],
        reports: [
          ...(await this.collectResourcesFromModules('reports')).map(
            (item) => item.name,
          ),
        ],
      };
    }
    return undefined;
  }

  /**
   * Returns list of module names in the project.
   * @returns List of module names in the project.
   */
  public async moduleNames(): Promise<string[]> {
    const moduleNames: string[] = [];
    if (pathExists(this.modulesFolder)) {
      const names = await readdir(this.modulesFolder);
      if (names) {
        moduleNames.push(...names);
      }
    }
    return moduleNames;
  }

  /**
   * Returns path to a module.
   * @param {string} moduleName Name of the module.
   * @returns path to a module.
   */
  public async modulePath(moduleName: string): Promise<string | undefined> {
    const module = await this.findSpecificModule(moduleName);
    return module && module.path ? join(module.path, module.name) : undefined;
  }

  /**
   * Returns list of modules in the project.
   * @returns list of modules in the project.
   */
  public async modules(): Promise<Resource[]> {
    return this.collectResourcesFromModules('modules');
  }

  /**
   * Getter. Path to modules folder.
   */
  public get modulesFolder(): string {
    return this.projectPaths.modulesFolder;
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

  public get paths(): ProjectPaths {
    return this.projectPaths;
  }

  /**
   * Returns full path to a given card.
   * @param {string} cardKey card to check path for.
   * @returns path to a given card.
   */
  public pathToCard(cardKey: string): string {
    const allFiles = getFilesSync(this.cardRootFolder);
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
    if (pathExists(this.modulesFolder)) {
      const files = await readdir(this.modulesFolder, {
        withFileTypes: true,
        recursive: true,
      });
      const configurationFiles = files
        .filter((dirent) => dirent.isFile())
        .filter((dirent) => dirent.name === Project.projectConfigFileName);

      const configurationPromises = configurationFiles.map(async (file) => {
        const configuration = (await readJsonFile(
          join(file.path, file.name),
        )) as ProjectSettings;
        return configuration.cardKeyPrefix;
      });

      const configurationPrefixes = await Promise.all(configurationPromises);
      prefixes.push(...configurationPrefixes);
    }

    return prefixes;
  }

  /**
   * Checks if a given resource exists in the project already.
   * @param resourceType Type of resource as a string.
   * @param name
   * @returns boolean, true if resource exists; false otherwise.
   */
  public async resourceExists(
    resourceType: ResourceFolderType,
    name: string,
  ): Promise<boolean> {
    const resources = await this.resourcesOfType(resourceType);
    const resource = resources.find(
      (item) => item.name === name + '.json' || item.name === name,
    );
    return resource !== undefined;
  }

  /**
   * Getter. Returns path to '.cards/local' folder.
   */
  public get resourcesFolder(): string {
    return join(this.basePath, '.cards', 'local');
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
    await this.readCardTreeToMemory(this.cardRootFolder, cards);
    return cards;
  }

  /**
   * Returns details of certain template.
   * @param templateName Name of the template.
   * @returns template resource details.
   */
  public async template(templateName: string): Promise<Resource | undefined> {
    return (
      (await this.templates()).find(
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
   * @param {string} templateName Name of a template
   * @returns true, if template named 'templateName' exists in project; false otherwise.
   */
  public async templateExists(templateName: string): Promise<boolean> {
    if (!templateName) {
      return false;
    }
    return (await this.templates()).some((item) => item.name === templateName);
  }

  /**
   * Returns path from a template card
   * @param {card} card template card item
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
   * @param {boolean} localOnly Return local templates, or all templates (includes module templates)
   * @returns array of all templates in the project.
   */
  public async templates(localOnly: boolean = false): Promise<Resource[]> {
    const moduleTemplates = await this.collectResourcesFromModules('templates');
    return localOnly
      ? this.localTemplates
      : [...this.localTemplates, ...moduleTemplates];
  }

  /**
   * Getter. Returns path to 'templates' subfolder.
   */
  public get templatesFolder(): string {
    return this.projectPaths.templatesFolder;
  }

  /**
   * Update card content.
   * @param {string} cardKey card's ID that is updated.
   * @param {string} content changed content
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
   * @param {string} cardKey card that is updated.
   * @param {string} changedKey changed metadata key
   * @param {MetadataContent} newValue changed value for the key
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
   * @param {card} card affected card
   * @param {CardMetadata} changedMetadata changed content for the card
   * @param {boolean} skipValidation Optional, if set does not validate the card
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
   * @param {card} card Card to validate.
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
   * @param {string} workflowName Name of the workflow (either filename (including .json extension), or workflow name).
   * @returns workflow configuration, or undefined if workflow cannot be found.
   */
  public async workflow(
    workflowName: string,
  ): Promise<WorkflowMetadata | undefined> {
    if (!workflowName) {
      return undefined;
    }
    if (!workflowName.endsWith('.json')) {
      workflowName += '.json';
    }
    const found = (await this.workflows()).find(
      (item) => item.name === workflowName && item.path,
    );

    if (!found || !found.path) {
      return undefined;
    }
    const file = (await readJsonFile(
      join(found.path, basename(found.name)),
    )) as WorkflowMetadata;
    return file;
  }

  /**
   * Finds initial state of a workflow.
   * @param {string} workflow Workflow name
   * @returns {string} workflow's initial state
   * <br>              undefined if either workflow cannot be found, or there is no initial state
   */
  public async workflowInitialState(
    workflow: string,
  ): Promise<string | undefined> {
    const workflowMetaData = await this.workflow(workflow);

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
   * @param {boolean} localOnly Return local workflows, or all workflows (includes module workflows)
   * @returns array of all workflows in the project.
   */
  public async workflows(localOnly: boolean = false): Promise<Resource[]> {
    const moduleWorkflows = await this.collectResourcesFromModules('workflows');
    return localOnly
      ? this.localWorkflows
      : [...this.localWorkflows, ...moduleWorkflows];
  }

  /**
   * Returns path to 'workflows' subfolder.
   * @returns path to 'workflows' subfolder.
   */
  public get workflowsFolder(): string {
    return this.projectPaths.workflowsFolder;
  }

  /**
   * Returns path to 'reports' subfolder
   * @returns path to 'workflows' subfolder.
   */
  public get reportsFolder(): string {
    return join(this.basePath, '.cards', 'local', 'reports');
  }

  /**
   * Array of reports in the project.
   * @param {boolean} localOnly Return local reports, or all reports (includes module reports)
   * @returns array of all reports in the project.
   */
  public async reports(localOnly: boolean = false): Promise<Resource[]> {
    const moduleReports = await this.collectResourcesFromModules('reports');
    return localOnly
      ? this.localReports
      : [...this.localReports, ...moduleReports];
  }
  /**
   * Returns details of certain report.
   * @param {string} reportName Name of the report (either filename (including .json extension), or report name).
   * @returns report configuration, or undefined if report cannot be found.
   */
  public async report(reportName: string): Promise<Report | undefined> {
    if (!reportName) {
      return undefined;
    }

    const found = (await this.reports()).find(
      (item) => item.name === reportName && item.path,
    );

    if (!found || !found.path) {
      return undefined;
    }
    const folder = join(found.path, basename(found.name));
    const metadata = (await readJsonFile(
      join(folder, 'report.json'),
    )) as ReportMetadata;

    const schemaPath = join(folder, 'parameterSchema.json');

    return {
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
}
