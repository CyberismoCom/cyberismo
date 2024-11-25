/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { basename, join, resolve, sep } from 'node:path';
import {
  constants as fsConstants,
  copyFile,
  mkdir,
  writeFile,
} from 'node:fs/promises';
import { EventEmitter } from 'node:events';

import { Calculate } from './calculate.js';
import { Validate } from './validate.js';
import {
  type DotSchemaContent,
  ProjectFile,
  Resource,
  ResourceFolderType,
} from './interfaces/project-interfaces.js';
import {
  CardType,
  DataType,
  FieldType,
  Link,
  ResourceMetadataType,
  TemplateMetadata,
  Workflow,
} from './interfaces/resource-interfaces.js';
import { errorFunction } from './utils/log-utils.js';
import { readJsonFile, writeJsonFile } from './utils/json.js';
import { Project } from './containers/project.js';
import { Template } from './containers/template.js';
import { EMPTY_RANK, sortItems } from './utils/lexorank.js';
import { fileURLToPath } from 'node:url';
import { copyDir, pathExists } from './utils/file-utils.js';
import {
  identifierFromResourceName,
  isResourceName,
  resourceNameParts,
} from './utils/resource-utils.js';
import { DefaultContent } from './create-defaults.js';

// todo: Is there a easy to way to make JSON schema into a TypeScript interface/type?
//       Check this out: https://www.npmjs.com/package/json-schema-to-ts

/**
 * Handles all creation operations.
 * Resources that it can create include attachments, cards, card types, projects, templates and workflows.
 */
export class Create extends EventEmitter {
  private defaultReportLocation: string = join(
    fileURLToPath(import.meta.url),
    '../../../../content/defaultReport',
  );

  private contentSchemaMap: Map<string, DotSchemaContent | undefined>;

  constructor(
    private project: Project,
    private calculateCmd: Calculate,
    private validateCmd: Validate,
    private projectPrefixes: string[],
  ) {
    super();

    this.addListener(
      'created',
      this.calculateCmd.handleNewCards.bind(this.calculateCmd),
    );

    // Match resource type to content schema file.
    this.contentSchemaMap = new Map([
      ['cardType', [{ id: 'cardTypeSchema', version: 1 }]],
      ['fieldType', [{ id: 'fieldTypeSchema', version: 1 }]],
      ['linkType', [{ id: 'linkTypeSchema', version: 1 }]],
      ['report', undefined], // report's content schema is inside its main folder
      ['template', undefined], // template's content schema is inside its main folder
      ['workflow', [{ id: 'workflowSchema', version: 1 }]],
    ]);
  }

  static JSONFileContent: ProjectFile[] = [
    {
      path: '.cards/local',
      content: [{ id: 'cardsConfigSchema', version: 1 }],
      name: Project.schemaContentFile,
    },
    {
      path: '.cards/local',
      content: {
        cardKeyPrefix: '$PROJECT-PREFIX',
        name: '$PROJECT-NAME',
      },
      name: Project.projectConfigFileName,
    },
  ];

  static gitIgnoreContent: string = `.calc\n
        .asciidoctor\n
        .vscode\n
        *.html\n
        *.pdf\n
        *.puml\n
        **/.DS_Store\n
        *-debug.log\n
        *-error.log\n`;

  static gitKeepContent: string = '';

  // Creates a new resource (...). If the resource folder is missing, creates it.
  private async createResource(
    resourceType: ResourceFolderType,
    resourceContent: ResourceMetadataType,
  ) {
    const resourceFolder = this.project.paths.resourcePath(resourceType);
    const resource = { name: resourceContent.name, path: resourceFolder };
    const contentSchema: DotSchemaContent | undefined =
      this.contentSchemaMap.get(resourceType);

    if (!pathExists(resourceFolder)) {
      await mkdir(resourceFolder);

      // Newly created folders should have content schema ('.schema') file.
      if (contentSchema) {
        await writeJsonFile(join(resourceFolder, '.schema'), contentSchema, {
          flag: 'wx',
        });
      } else {
        // if they don't, copy .gitkeep into the empty folder and do their own special instantiation
        await writeFile(
          join(this.project.paths.calculationProjectFolder, '.gitkeep'),
          Create.gitKeepContent,
        );
        if (resourceType === 'template') {
          const template = new Template(this.project, {
            name: resourceContent.name,
            path: '',
          });
          await template.create(resourceContent);
        }
      }
    }
    if (contentSchema) {
      const { identifier } = resourceNameParts(resourceContent.name!);
      await writeJsonFile(
        join(resourceFolder, `${identifier}.json`),
        resourceContent,
        { flag: 'wx' },
      );
    }
    this.project.addResource(resource);
  }

  /**
   * Adds new cards to a template.
   * @param cardTypeName Card type for new cards.
   * @param templateName Template name to add cards into.
   * @param card Optional, if defined adds a new child-card under the card.
   * @param count How many cards to add. By default one.
   * @returns non-empty string array with ids of added cards
   */
  public async addCards(
    cardTypeName: string,
    templateName: string,
    card?: string,
    count: number = 1,
  ): Promise<string[]> {
    if (
      !templateName ||
      !Validate.validateFolder(join(this.project.basePath, templateName))
    ) {
      throw new Error(
        `Input validation error: template name is invalid '${templateName}'`,
      );
    }
    if (cardTypeName === undefined) {
      throw new Error(`Input validation error: card type cannot be empty`);
    }
    // Use slice to get a copy of a string.
    const origTemplateName = templateName.slice(0);
    templateName = identifierFromResourceName(templateName);
    if (templateName === '') {
      throw Error(`Template '${origTemplateName}' is invalid template name`);
    }
    const templateObject = new Template(
      this.project,
      { name: templateName, path: '' }, // Template can deduce its own path
    );

    const specificCard = card
      ? await templateObject.findSpecificCard(card)
      : undefined;
    if (card && !specificCard) {
      throw Error(
        `Card '${card}' was not found from template '${origTemplateName}'`,
      );
    }

    if (templateObject.templateFolder().includes(`${sep}modules${sep}`)) {
      throw Error(`Cannot add cards to imported module templates`);
    }

    // Collect all add-card promises and settle them in parallel.
    const promiseContainer = [];
    const cardsContainer: string[] = [];
    for (let cardCount = 0; cardCount < count; ++cardCount) {
      promiseContainer.push(templateObject.addCard(cardTypeName, specificCard));
    }
    const promisesResult = await Promise.allSettled(promiseContainer).then(
      (results) => {
        for (const result of results) {
          if (result.status !== 'fulfilled') {
            throw new Error(`Promise not filled`);
          }
          cardsContainer.push(result.value);
        }
      },
    );

    if (cardsContainer.length === 0) {
      throw new Error(`Invalid value for 'repeat:' "${count}"`);
    }

    if (promisesResult === undefined) {
      return cardsContainer;
    } else {
      throw new Error('Unknown error');
    }
  }

  /**
   * Adds an attachment to a card.
   * @param cardKey card ID
   * @param attachment path to an attachment file or attachment name if buffer is defined
   * @param buffer (Optional) attachment buffer
   */
  public async createAttachment(
    cardKey: string,
    attachment: string,
    buffer?: Buffer,
  ) {
    if (!buffer && !pathExists(attachment)) {
      throw new Error(
        `Input validation error: cannot find attachment '${attachment}'`,
      );
    }
    const attachmentFolder = await this.project.cardAttachmentFolder(cardKey);
    if (!attachmentFolder) {
      throw new Error(`Attachment folder for '${cardKey}' not found`);
    }

    // Imported templates cannot be modified.
    if (attachmentFolder.includes(`${sep}modules${sep}`)) {
      throw new Error(`Cannot modify imported module`);
    }

    try {
      await mkdir(attachmentFolder, { recursive: true }).then(async () => {
        if (!buffer) {
          return copyFile(
            attachment,
            join(attachmentFolder, basename(attachment)),
            fsConstants.COPYFILE_EXCL,
          );
        }
        return writeFile(join(attachmentFolder, basename(attachment)), buffer, {
          flag: 'wx',
        });
      });
    } catch (error) {
      throw new Error(errorFunction(error));
    }
  }

  /**
   * Call this before calling other 'create' functions. If importing new modules, should be called again.
   */
  public async setProjectPrefixes(): Promise<void> {
    this.projectPrefixes = await this.project.projectPrefixes();
  }

  /**
   * Creates card(s) to a project. All cards from template are instantiated to the project.
   * @param templateName name of a template to use
   * @param parentCardKey (Optional) card-key of a parent card. If missing, cards are added to the card root.
   * @returns array of card keys that were created. Cards are sorted by their parent key and rank. Template root cards are first but the order between other card groups is not guaranteed. However, the order of cards within a group is guaranteed to be ordered by rank.
   */
  public async createCard(
    templateName: string,
    parentCardKey?: string,
  ): Promise<string[]> {
    const templateObject =
      await this.project.createTemplateObjectByName(templateName);
    if (!templateObject || !templateObject.isCreated()) {
      throw new Error(`Template '${templateName}' not found from project`);
    }

    const validator = Validate.getInstance();
    const content = (await readJsonFile(
      templateObject.templateConfigurationFilePath(),
    )) as TemplateMetadata;
    const validJson = validator.validateJson(content, 'templateSchema');
    if (validJson.length !== 0) {
      throw new Error(`Invalid template JSON: ${validJson}`);
    }

    const specificCard = parentCardKey
      ? await this.project.findSpecificCard(parentCardKey, {
          metadata: true,
          children: true,
        })
      : undefined;
    if (parentCardKey && !specificCard) {
      throw new Error(`Card '${parentCardKey}' not found from project`);
    }

    const createdCards = await templateObject.createCards(specificCard);
    if (createdCards.length > 0) {
      this.emit('created', createdCards);
      // Note: This assumes that parent keys will be ahead of 'a' in the sort order.
      const sorted = sortItems(createdCards, (item) => {
        return `${item.parent === 'root' ? 'a' : item.parent}${item.metadata?.rank || EMPTY_RANK}`;
      });
      return sorted.map((item) => item.key);
    }
    return [];
  }

  /**
   * Creates a card type.
   * @param cardTypeName name for the card type.
   * @param workflowName workflow name to use in the card type.
   */
  public async createCardType(cardTypeName: string, workflowName: string) {
    const validCardTypeName = await this.validateCmd.validResourceName(
      'cardTypes',
      cardTypeName,
      this.projectPrefixes,
    );
    if (!isResourceName(validCardTypeName)) {
      throw new Error(
        `Resource name must be a valid name (<prefix>/<type>/<identifier>) when calling 'createCardType()'`,
      );
    }
    const validWorkflowName = await this.validateCmd.validResourceName(
      'workflows',
      workflowName,
      this.projectPrefixes,
    );
    if (!(await this.project.resourceExists('workflow', validWorkflowName))) {
      throw new Error(
        `Input validation error: workflow '${workflowName}' does not exist in the project.`,
      );
    }
    if (await this.project.resourceExists('cardType', validCardTypeName)) {
      throw new Error(
        `Input validation error: card type '${cardTypeName}' already exists in the project.`,
      );
    }

    const content: CardType = DefaultContent.cardType(
      validCardTypeName,
      validWorkflowName,
    );
    await this.createResource('cardType', content);
  }

  /**
   * Creates a new field type.
   * @param fieldTypeName name for the field type.
   * @param dataType data type for the field type
   */
  public async createFieldType(fieldTypeName: string, dataType: string) {
    const validFieldTypeName = await this.validateCmd.validResourceName(
      'fieldTypes',
      fieldTypeName,
      this.projectPrefixes,
    );
    if (!isResourceName(validFieldTypeName)) {
      throw new Error(
        `Resource name must be a valid name (<prefix>/<type>/<identifier>) when calling 'createFieldType()'`,
      );
    }
    if (await this.project.resourceExists('fieldType', validFieldTypeName)) {
      throw new Error(
        `Field type with name '${fieldTypeName}' already exists in the project`,
      );
    }
    if (!Create.supportedFieldTypes().includes(dataType)) {
      throw new Error(
        `Field type '${dataType}' not supported. Supported types ${Create.supportedFieldTypes().join(', ')}`,
      );
    }
    const useDataType: DataType = dataType as DataType;

    const content: FieldType = {
      name: validFieldTypeName,
      dataType: useDataType,
    };
    await this.createResource('fieldType', content);
  }

  /**
   * Creates a new link type.
   * @param linkTypeName name for the link type.
   */
  public async createLinkType(linkTypeName: string) {
    const validLinkTypeName = await this.validateCmd.validResourceName(
      'linkTypes',
      linkTypeName,
      this.projectPrefixes,
    );
    if (!isResourceName(validLinkTypeName)) {
      throw new Error(
        `Resource name must be a valid name (<prefix>/<type>/<identifier>) when calling 'createLinkType()'`,
      );
    }
    if (await this.project.resourceExists('linkType', validLinkTypeName)) {
      throw new Error(
        `Link type with name '${linkTypeName}' already exists in the project`,
      );
    }

    const content = DefaultContent.linkTypeContent(validLinkTypeName);
    // check if link type JSON is valid
    const validator = Validate.getInstance();
    const validJson = validator.validateJson(content, 'linkTypeSchema');
    if (validJson.length !== 0) {
      throw new Error(`Invalid link type JSON: ${validJson}`);
    }
    await this.createResource('linkType', content);
  }

  /**
   * Creates a link between two cards.
   * @param cardKey The card to update
   * @param destinationCardKey The card to link to
   * @param linkType The type of link to add
   * @param linkDescription Optional description of the link
   */
  public async createLink(
    cardKey: string,
    destinationCardKey: string,
    linkType: string,
    linkDescription?: string,
  ) {
    if (cardKey === destinationCardKey) {
      throw new Error('Cannot link card to itself');
    }

    // Determine the card path
    const card = await this.project.findSpecificCard(cardKey, {
      metadata: true,
    });
    if (!card) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }

    const destinationCard = await this.project.findSpecificCard(
      destinationCardKey,
      {
        metadata: true,
      },
    );
    if (!destinationCard) {
      throw new Error(
        `Card '${destinationCardKey}' does not exist in the project`,
      );
    }
    // make sure the link type exists
    const linkTypeObject = await this.project.linkType(linkType);

    if (!linkTypeObject) {
      throw new Error(`Link type '${linkType}' does not exist in the project`);
    }

    // make sure that if linkDescription is not enabled, linkDescription is not provided
    if (
      !linkTypeObject.enableLinkDescription &&
      linkDescription !== undefined
    ) {
      throw new Error(
        `Link type '${linkType}' does not allow link description`,
      );
    }

    // make sure source card key exists in the link type sourceCardTypes
    // if sourceCardTypes is empty, any card can be linked
    if (
      linkTypeObject.sourceCardTypes.length > 0 &&
      !linkTypeObject.sourceCardTypes.includes(card.metadata!.cardType)
    ) {
      throw new Error(
        `Card type '${card.metadata?.cardType}' cannot be linked with link type '${linkType}'`,
      );
    }

    // make sure destination card key exists in the link type destinationCardTypes
    // if destinationCardTypes is empty, any card can be linked
    if (
      linkTypeObject.destinationCardTypes.length > 0 &&
      !linkTypeObject.destinationCardTypes.includes(
        destinationCard.metadata!.cardType,
      )
    ) {
      throw new Error(
        `Card type '${destinationCard.metadata!.cardType}' cannot be linked with link type '${linkType}'`,
      );
    }

    // if contains the same link, do not add it again
    const existingLink = card.metadata?.links.find(
      (l) =>
        l.linkType === linkType &&
        l.cardKey === destinationCardKey &&
        l.linkDescription === linkDescription,
    );
    if (existingLink) {
      throw new Error(
        `Link from card '${cardKey}' to card '${destinationCardKey}' already exists`,
      );
    }

    const links: Link[] = card.metadata?.links || [];
    links.push({
      linkType,
      cardKey: destinationCardKey,
      linkDescription,
    });

    await this.project.updateCardMetadataKey(cardKey, 'links', links);
  }

  /**
   * Creates a new project.
   * @param projectPath where to create the project.
   * @param projectPrefix prefix for the project.
   * @param projectName name for the project.
   * @param validateCmd validator
   */
  public static async createProject(
    projectPath: string,
    projectPrefix: string,
    projectName: string,
  ) {
    projectPath = resolve(projectPath);
    const projectFolders: string[] = ['.cards/local', 'cardRoot'];

    if (
      projectPrefix === undefined ||
      projectPrefix.length < 3 ||
      projectPrefix.length > 10
    ) {
      throw new Error(
        `Input validation error: prefix must be from 3 to 10 characters long. '${projectPrefix}' does not fulfill the condition.`,
      );
    }
    if (!Validate.isValidResourceName(projectName)) {
      throw new Error(
        `Input validation error: invalid project name '${projectName}'`,
      );
    }
    if (!Validate.validatePrefix(projectPrefix)) {
      throw new Error(
        `Input validation error: invalid prefix '${projectPrefix}'`,
      );
    }

    if (Project.isCreated(projectPath)) {
      throw new Error('Project already exists');
    }

    if (!Validate.isValidResourceName(projectName)) {
      throw new Error(
        `Input validation error: invalid project name '${projectName}'`,
      );
    }

    await mkdir(projectPath, { recursive: true }).then(async () => {
      return await Promise.all(
        projectFolders.map((folder) =>
          mkdir(`${projectPath}/${folder}`, { recursive: true }),
        ),
      );
    });
    Create.JSONFileContent.forEach(async (entry) => {
      if ('cardKeyPrefix' in entry.content) {
        if (entry.content.cardKeyPrefix.includes('$PROJECT-PREFIX')) {
          entry.content.cardKeyPrefix = projectPrefix.toLowerCase();
        }
        if (entry.content.name.includes('$PROJECT-NAME')) {
          entry.content.name = projectName;
        }
      }
      await writeJsonFile(
        join(projectPath, entry.path, entry.name),
        entry.content,
      );
    });

    try {
      await writeFile(join(projectPath, '.gitignore'), this.gitIgnoreContent);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Failed to create project');
      }
    }
  }

  /**
   * Creates a new template to a project.
   * @param templateName Name of the template.
   * @param templateContent JSON content for the template file.
   */
  public async createTemplate(templateName: string, templateContent: string) {
    let validTemplateName = await this.validateCmd.validResourceName(
      'templates',
      templateName,
      this.projectPrefixes,
    );
    if (!isResourceName(validTemplateName)) {
      throw new Error(
        `Resource name must be a valid name (<prefix>/<type>/<identifier>)  when calling 'createTemplate()'`,
      );
    }
    if (!Validate.validateFolder(join(this.project.basePath, templateName))) {
      throw new Error(
        `Input validation error: template name is invalid '${templateName}'`,
      );
    }
    const content = templateContent
      ? (JSON.parse(templateContent) as TemplateMetadata)
      : DefaultContent.templateContent(templateName);

    validTemplateName = identifierFromResourceName(validTemplateName);

    const validJson = this.validateCmd.validateJson(content, 'templateSchema');
    if (validJson.length !== 0) {
      throw new Error(`Invalid template JSON: ${validJson}`);
    }

    if (await this.project.templateExists(validTemplateName)) {
      throw new Error(
        `Template '${templateName}' already exists in the project`,
      );
    }

    const resource = {
      name: validTemplateName,
      path: join(this.project.paths.templatesFolder, ''),
    };

    const template = new Template(this.project, resource);
    await template.create(content);

    this.project.addResource(resource);
  }

  /**
   * Creates a workflow.
   * @param workflowName workflow name
   * @param workflowContent workflow content JSON
   */
  public async createWorkflow(workflowName: string, workflowContent: string) {
    const validWorkflowName = await this.validateCmd.validResourceName(
      'workflows',
      workflowName,
      this.projectPrefixes,
    );
    if (!isResourceName(validWorkflowName)) {
      throw new Error(
        `Resource name must be a valid name (<prefix>/<type>/<identifier>)  when calling 'createWorkflow()'`,
      );
    }
    const workflow = workflowContent
      ? (JSON.parse(workflowContent) as Workflow)
      : DefaultContent.workflowContent(validWorkflowName);
    workflow.name = validWorkflowName;

    if (await this.project.resourceExists('workflow', workflow.name)) {
      throw new Error(
        `Workflow with name '${workflow.name}' already exists in the project`,
      );
    }

    const schemaId = 'workflowSchema';
    const validJson = this.validateCmd.validateJson(workflow, schemaId);
    if (validJson.length !== 0) {
      throw new Error(`Invalid workflow JSON: ${validJson}`);
    }
    const content = JSON.parse(JSON.stringify(workflow)) as Workflow;
    await this.createResource('workflow', content);
  }

  /**
   * Creates a report
   * @param name name of the report
   */
  public async createReport(name: string) {
    const validReportName = await this.validateCmd.validResourceName(
      'reports',
      name,
      this.projectPrefixes,
    );
    if (!isResourceName(validReportName)) {
      throw new Error(
        `Resource name must be a valid name (<prefix>/<type>/<identifier>)  when calling 'createWorkflow()'`,
      );
    }

    const report = await this.project.report(validReportName);
    if (report) {
      throw new Error(`Report '${name}' already exists in the project`);
    }

    const destination = join(this.project.paths.reportsFolder, name);
    await copyDir(this.defaultReportLocation, destination);

    const resource: Resource = { name: validReportName, path: destination };
    this.project.addResource(resource);
  }

  /**
   * Returns a list of supported field types.
   * @returns list of supported field types.
   */
  public static supportedFieldTypes(): string[] {
    return [
      'shortText',
      'longText',
      'number',
      'integer',
      'boolean',
      'enum',
      'list',
      'date',
      'dateTime',
      'person',
    ];
  }
}
