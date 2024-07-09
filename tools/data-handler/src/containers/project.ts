// node
import { basename, dirname, join, resolve, sep } from 'node:path';
import { Dirent, readdirSync } from 'node:fs';
import { readdir } from 'node:fs/promises';

// ismo
import {
  attachmentDetails,
  card,
  cardListContainer,
  cardNameRegEx,
  cardtype,
  fetchCardDetails,
  fieldtype,
  metadataContent,
  moduleSettings,
  project,
  projectSettings,
  resource,
  workflowMetadata,
} from '../interfaces/project-interfaces.js';
import { getFilesSync, pathExists } from '../utils/file-utils.js';
import { ProjectSettings } from '../project-settings.js';
import { readJsonFile } from '../utils/json.js';
import { Template } from './template.js';
import { Validate } from '../validate.js';

// base class
import { CardContainer } from './card-container.js';

/**
 * Represents project folder.
 */
export class Project extends CardContainer {
  private settings: ProjectSettings;
  private validator: Validate;

  private localCalculations: resource[] = [];
  private localCardtypes: resource[] = [];
  private localFieldtypes: resource[] = [];
  private localTemplates: resource[] = [];
  private localWorkflows: resource[] = [];

  constructor(path: string) {
    super(path, '');

    this.settings = ProjectSettings.getInstance(this.projectSettingFile);
    this.containerName = this.settings.name;
    // todo: implement project validation
    this.validator = Validate.getInstance();

    this.localCalculations = this.resourcesSync('calculation', 'file');
    this.localCardtypes = this.resourcesSync('cardtype', 'file');
    this.localFieldtypes = this.resourcesSync('fieldtype', 'file');
    this.localTemplates = this.resourcesSync('template', 'folder');
    this.localWorkflows = this.resourcesSync('workflow', 'file');
  }

  // Add resources to an array.
  private async addResources(
    resources: Dirent[],
    requestedType: string,
  ): Promise<resource[]> {
    const collectedResources: resource[] = [];
    const filteredDirectories = requestedType === 'templates' ? true : false;
    for (const resource of resources) {
      if (requestedType === 'modules') {
        collectedResources.push(...resources);
      } else {
        const resourcePath = join(
          this.modulesFolder,
          resource.name,
          requestedType,
        );
        const files = await readdir(resourcePath, { withFileTypes: true });
        const filteredFiles = filteredDirectories
          ? files.filter((item) => item.isDirectory())
          : files.filter((item) => item.name !== Project.schemaContentFile);

        filteredFiles.forEach((item) => {
          item.name = `${resource.name}/${item.name}`;
          collectedResources.push({ name: item.name, path: item.path });
        });
      }
    }
    return collectedResources;
  }

  // Collect resources from modules
  private async collectResourcesFromModules(type: string): Promise<resource[]> {
    if (!pathExists(this.modulesFolder)) {
      return [];
    }

    const moduleDirectories = await readdir(this.modulesFolder, {
      withFileTypes: true,
    });
    const modules = moduleDirectories.filter((item) => item.isDirectory());

    return [...(await this.addResources(modules, type))];
  }

  // Finds specific module.
  private async findSpecificModule(
    moduleName: string,
  ): Promise<resource | undefined> {
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

  // Reads cardtree to memory. This is with minimal information (e.g no attachments, no content).
  // todo: combine with function of same in Export; add here booleans 'include content', 'include attachments'
  private async readCardTreeToMemory(cardrootPath: string, cards?: card[]) {
    // Finds card from already collected cards using filename path.
    function findCard(path: string, cards: card[] | undefined) {
      return cards?.find((card) => card.key === basename(path));
    }

    // Filter out the schema validation files.
    let entries = await readdir(cardrootPath, { withFileTypes: true });
    entries = entries.filter((entry) => {
      return entry.name !== Project.schemaContentFile;
    });

    // Loop through all the found file entries and collect found cards.
    for (const entry of entries) {
      if (entry.isDirectory() && cardNameRegEx.test(entry.name)) {
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
          found.metadata = await readJsonFile(join(entry.path, entry.name));
        }
      }
    }
  }

  // Collects certain kinds of resources.
  private resourcesSync(type: string, requirement: string): resource[] {
    let resourceFolder: string;
    if (type === 'calculation') {
      resourceFolder = this.calculationProjectFolder;
    } else if (type === 'cardtype') {
      resourceFolder = this.cardtypesFolder;
    } else if (type === 'fieldtype') {
      resourceFolder = this.fieldtypesFolder;
    } else if (type === 'template') {
      resourceFolder = this.templatesFolder;
    } else if (type === 'workflow') {
      resourceFolder = this.workflowsFolder;
    } else {
      return [];
    }

    const resources: resource[] = [];
    if (!pathExists(resourceFolder)) {
      // for some reason, the specific resource folder does not exists
      console.error(`Cannot find folder '${resourceFolder}'`);
      // todo: automatically create resource folder with correct .schema file.
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
          return { name: entry.name, path: entry.path };
        }),
    );

    return resources;
  }

  /**
   * Returns an array of all the attachments in the project card's (excluding ones in templates).
   * @returns all attachments in the project.
   */
  public async attachments(): Promise<attachmentDetails[]> {
    return super.attachments(this.cardrootFolder);
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
    return join(this.basePath, '.cards', 'local', 'calculations');
  }

  /**
   * Returns an array of all the calculation files (*.lp) in the project.
   * @returns array of all calculation files in the project.
   */
  public async calculations(): Promise<resource[]> {
    const moduleCalculations =
      await this.collectResourcesFromModules('calculations');
    return [...this.localCalculations, ...moduleCalculations];
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
      ? join(this.cardrootFolder, pathToProjectCard, 'a')
      : '';
  }

  /**
   * Returns details (as defined by cardDetails) of a card.
   * @param {string} cardKey card key (project prefix and a number, e.g. test_1)
   * @param {fetchCardDetails} cardDetails which card details are returned.
   * @returns Card details, or undefined if the card cannot be found.
   */
  public async cardDetailsById(
    cardKey: string,
    cardDetails: fetchCardDetails,
  ): Promise<card | undefined> {
    return this.findSpecificCard(cardKey, cardDetails);
  }

  /**
   * Returns path to card's folder.
   * @param {string} cardKey card key
   * @returns path to card's folder.
   */
  public async cardFolder(cardKey: string): Promise<string> {
    const found = await super.findCard(this.cardrootFolder, cardKey);
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
   * Getter. Returns path to card-root.
   */
  public get cardrootFolder(): string {
    return join(this.basePath, 'cardroot');
  }

  /**
   * Returns an array of all the cards in the project. Cards have content and metadata
   * @param {string} path Optional path from which to fetch the cards. Generally it is best to fetch from Project root, e.g. Project.cardRootFolder
   * @param {string} details Which details to include in the cards; by default only "content" and "metadata" are included.
   * @returns all cards from the given path in the project.
   */
  public async cards(
    path: string = this.cardrootFolder,
    details: fetchCardDetails = { content: true, metadata: true },
  ): Promise<card[]> {
    return super.cards(path, details);
  }

  /**
   * Returns the content of a specific cardtype.
   * @param {string} cardTypeName Name of cardtype to fetch. Can either be filename (including .json extension), or just name.
   * @returns JSON content of cardtype, or undefined if the cardtype cannot be found.
   */
  public async cardType(cardTypeName?: string): Promise<cardtype | undefined> {
    if (!cardTypeName) return undefined;
    if (!cardTypeName.endsWith('.json')) {
      cardTypeName += '.json';
    }
    const found = (await this.cardtypes()).find(
      (item) => item.name === cardTypeName && item.path,
    );

    if (!found || !found.path) {
      return undefined;
    }
    // todo: somehow should automatically fill-in 'default' values.
    const content = await readJsonFile(join(found.path, basename(found.name)));
    if (content.customFields) {
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
            return undefined;
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
   * Returns an array of all the cardtypes in the project.
   * @returns array of all cardtypes in the project.
   */
  public async cardtypes(): Promise<resource[]> {
    const moduleCardtypes = await this.collectResourcesFromModules('cardtypes');
    return [...this.localCardtypes, ...moduleCardtypes];
  }

  /**
   * Getter. Returns path to 'cardtypes' folder.
   */
  public get cardtypesFolder(): string {
    return join(this.basePath, '.cards', 'local', 'cardtypes');
  }

  /**
   * Returns project configuration.
   * @returns project configuration.
   */
  public get configuration(): ProjectSettings {
    return this.settings;
  }

  /**
   * Creates a Template object. It is ensured that the template is part of project.
   * @param {resource} template Template resource (name + path)
   * @returns Template object, or undefined if template does not exist in the project.
   */
  public async createTemplateObject(
    template: resource,
  ): Promise<Template | undefined> {
    template.name = Template.normalizedTemplateName(template.name);

    if (template.name === '' || !(await this.templateExists(template.name))) {
      return undefined;
    }

    const templateObject = new Template(this.basePath, template, this);
    await templateObject.create({ buttonLabel: '', namePrompt: '' });
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
  ): Promise<fieldtype | undefined> {
    if (!fieldTypeName) {
      return undefined;
    }
    if (!fieldTypeName.endsWith('.json')) {
      fieldTypeName += '.json';
    }
    const found = (await this.fieldtypes()).find(
      (item) => item.name === fieldTypeName && item.path,
    );

    if (!found || !found.path) {
      return undefined;
    }
    return readJsonFile(join(found.path, basename(found.name)));
  }

  /**
   * Returns an array of all the cardtypes in the project.
   * @returns array of all cardtypes in the project.
   */
  public async fieldtypes(): Promise<resource[]> {
    const moduleFieldtypes =
      await this.collectResourcesFromModules('fieldtypes');
    return [...this.localFieldtypes, ...moduleFieldtypes];
  }

  /**
   * Returns path to 'fieldtypes' folder.
   * @returns path to 'fieldtypes' folder.
   */
  public get fieldtypesFolder(): string {
    return join(this.basePath, '.cards', 'local', 'fieldtypes');
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
   * @param {string} cardKey Cardkey to find
   * @param {fetchCardDetails} details Defines which card details are included in the return values.
   * @returns specific card details, or undefined if card is not part of the project.
   */
  public async findSpecificCard(
    cardKey: string,
    details: fetchCardDetails = {},
  ): Promise<card | undefined> {
    const projectCard = await super.findCard(
      this.cardrootFolder,
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
   * Flattens card-tree so that children are shown on same level regardless of nesting level.
   * @param {card[]} array cardtree
   * @returns flattened cardtree.
   */
  public static flattenCardArray(array: card[]) {
    const result: card[] = [];
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
    return super.hasCard(cardKey, this.cardrootFolder);
  }

  /**
   * Checks if given path is a project.
   * @param {string} path Path to a project
   * @returns true, if in the given path there is a project; false otherwise
   */
  static isCreated(path: string): boolean {
    return pathExists(join(path, 'cardroot'));
  }

  /**
   * Checks if given card is in some template.
   * @param {card} card card object to check
   * @returns true if card exists in a template; false otherwise
   */
  static isTemplateCard(card: card): boolean {
    return (
      card.path.includes(`${sep}templates${sep}`) ||
      card.path.includes(`${sep}modules${sep}`)
    );
  }

  /**
   * Returns an array of all the cards in the project. Cards don't have content and nor metadata.
   * @param includeTemplateCards Whether or not to include cards in templates
   * @returns all cards in the project.
   */
  public async listAllCards(
    includeTemplateCards: boolean,
  ): Promise<cardListContainer[]> {
    const cardListContainer: cardListContainer[] = [];
    const projectCards = (await super.cards(this.cardrootFolder)).map(
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
  public async module(moduleName: string): Promise<moduleSettings | undefined> {
    const module = await this.findSpecificModule(moduleName);
    if (module && module.path) {
      const moduleNameAndPath = join(module.path, module.name);
      const moduleConfig = await readJsonFile(
        join(moduleNameAndPath, Project.projectConfigFileName),
      );
      return {
        name: moduleConfig.name,
        path: moduleNameAndPath,
        cardkeyPrefix: moduleConfig.cardkeyPrefix,
        nextAvailableCardNumber: moduleConfig.nextAvailableCardNumber,
        // resources:
        calculations: [
          ...(await this.collectResourcesFromModules('calculations')).map(
            (item) => item.name,
          ),
        ],
        cardtypes: [
          ...(await this.collectResourcesFromModules('cardtypes')).map(
            (item) => item.name,
          ),
        ],
        fieldtypes: [
          ...(await this.collectResourcesFromModules('fieldtypes')).map(
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
  public async modules(): Promise<resource[]> {
    return this.collectResourcesFromModules('modules');
  }

  /**
   * Getter. Path to modules folder.
   */
  public get modulesFolder(): string {
    return join(this.basePath, '.cards', 'modules');
  }

  /**
   * Returns full path to a given card.
   * @param {string} cardKey card to check path for.
   * @returns path to a given card.
   */
  public pathToCard(cardKey: string): string {
    const allFiles = getFilesSync(this.cardrootFolder);
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
    return this.settings.cardkeyPrefix;
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
        const configuration: projectSettings = await readJsonFile(
          join(file.path, file.name),
        );
        return configuration.cardkeyPrefix;
      });

      const configurationPrefixes = await Promise.all(configurationPromises);
      prefixes.push(...configurationPrefixes);
    }

    return prefixes;
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
  public async show(): Promise<project> {
    return {
      name: this.containerName,
      path: this.basePath,
      prefix: this.projectPrefix,
      nextAvailableCardNumber: this.settings.nextAvailableCardNumber,
      numberOfCards: (await this.listAllCards(false))[0].cards.length,
    };
  }

  /**
   * Show cards of a project.
   * @returns an array of all project cards in the project.
   */
  public async showProjectCards(): Promise<card[]> {
    const cards: card[] = [];
    await this.readCardTreeToMemory(this.cardrootFolder, cards);
    return cards;
  }

  /**
   * Returns details of certain template.
   * @param templateName Name of the template.
   * @returns template resource details.
   */
  public async template(templateName: string): Promise<resource | undefined> {
    return (
      (await this.templates()).find(
        (item) => item.name === templateName && item.path,
      ) || undefined
    );
  }

  /**
   * Returns path from a template card
   * @param {card} card template card item
   * @returns path of template card
   */
  public static templatePathFromCardPath(card: card): string {
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
   * Array of templates in the project.
   * @param {boolean} localOnly Return local templates, or all templates (includes module templates)
   * @returns array of all templates in the project.
   */
  public async templates(localOnly: boolean = false): Promise<resource[]> {
    const moduleTemplates = await this.collectResourcesFromModules('templates');
    return localOnly
      ? [...this.localTemplates]
      : [...this.localTemplates, ...moduleTemplates];
  }

  /**
   * Getter. Returns path to 'templates' subfolder.
   */
  public get templatesFolder(): string {
    return join(this.basePath, '.cards', 'local', 'templates');
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
   * Updates card metadata.
   * @param {string} cardKey card that is updated.
   * @param {string} changedKey changed metadata key
   * @param {metadataContent} newValue changed value for the key
   */
  public async updateCardMetadata(
    cardKey: string,
    changedKey: string,
    newValue: metadataContent,
  ) {
    if (await this.updateMetatadataKey(cardKey, changedKey, newValue)) {
      await this.onCardUpdate(cardKey);
    }
  }

  /**
   * This function should be called after card is updated.
   * Updates lastUpdated metadata key.
   */
  private async onCardUpdate(cardKey: string) {
    return this.updateMetatadataKey(
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
  private async updateMetatadataKey(
    cardKey: string,
    changedKey: string,
    newValue: metadataContent,
  ) {
    const card = await this.findCard(this.basePath, cardKey, {
      metadata: true,
    });
    if (!card) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }

    const validCard = await this.validateCard(card);
    if (validCard.length !== 0) {
      throw new Error(`Card '${cardKey}' is not valid!`);
    }

    if (card.metadata) {
      const cardAsRecord: Record<string, metadataContent> = card.metadata;
      cardAsRecord[changedKey] = newValue;
      await this.saveCardMetadata(card);
      return true;
    }
    return false;
  }

  /**
   * Validates that card's data is valid.
   * @param {card} card Card to validate.
   */
  public async validateCard(card: card): Promise<string> {
    const validCustomData = await this.validator.validateCustomFields(
      this,
      card,
    );
    const validWorkFlow = await this.validator.validateWorkflowState(
      this,
      card,
    );
    if (validCustomData.length === 0 && validWorkFlow.length === 0) {
      return '';
    }
    return `${validCustomData} + ${validWorkFlow}`;
  }

  /**
   * Returns details of certain workflow.
   * @param {string} workflowName Name of the workflow (either filename (including .json extension), or workflow name).
   * @returns workflow configuration, or undefined if workflow cannot be found.
   */
  public async workflow(
    workflowName: string,
  ): Promise<workflowMetadata | undefined> {
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
    return readJsonFile(join(found.path, basename(found.name)));
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
   * @returns array of all workflows in the project.
   */
  public async workflows(): Promise<resource[]> {
    const moduleWorkflows = await this.collectResourcesFromModules('workflows');
    return [...this.localWorkflows, ...moduleWorkflows];
  }

  /**
   * Returns path to 'workflows' subfolder.
   * @returns path to 'workflows' subfolder.
   */
  public get workflowsFolder(): string {
    return join(this.basePath, '.cards', 'local', 'workflows');
  }
}
