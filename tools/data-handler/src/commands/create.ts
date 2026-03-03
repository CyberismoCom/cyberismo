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
import { join, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import { SCHEMA_VERSION } from '@cyberismo/assets';
import { errorFunction } from '../utils/error-utils.js';
import { getChildLogger } from '../utils/log-utils.js';
import { Project } from '../containers/project.js';
import { Validate } from './validate.js';

import { EMPTY_RANK, sortItems } from '../utils/lexorank.js';
import { ROOT } from '../utils/constants.js';
import { isModulePath } from '../utils/card-utils.js';
import type { DataType } from '../interfaces/resource-interfaces.js';
import type { Card, ProjectFile } from '../interfaces/project-interfaces.js';
import { resourceName, resourceNameToString } from '../utils/resource-utils.js';
import { write } from '../utils/rw-lock.js';
import { writeJsonFile } from '../utils/json.js';
import { ConfigurationLogger } from '../utils/configuration-logger.js';

// todo: Is there a easy to way to make JSON schema into a TypeScript interface/type?
//       Check this out: https://www.npmjs.com/package/json-schema-to-ts

/**
 * Handles all create commands.
 */
export class Create {
  constructor(private project: Project) {}

  private get logger() {
    return getChildLogger({
      module: 'create',
    });
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
        schemaVersion: SCHEMA_VERSION,
        version: 0,
        cardKeyPrefix: '$PROJECT-PREFIX',
        name: '$PROJECT-NAME',
        description: '',
        modules: [],
        hubs: [],
      },
      name: Project.projectConfigFileName,
    },
  ];

  static gitIgnoreContent: string[] = [
    '.calc',
    '.asciidoctor',
    '.vscode',
    '*.html',
    '*.pdf',
    '*.puml',
    '**/.DS_Store',
    '*-debug.log',
    '*-error.log',
    '.temp',
    '.logs',
    '.cache',
  ];

  /**
   * Adds new cards to a template.
   * @param cardTypeName Card type for new cards.
   * @param templateName Template name to add cards into.
   * @param card Optional, if defined adds a new child-card under the card.
   * @param count How many cards to add. By default one.
   * @returns non-empty string array with ids of added cards
   */
  @write(
    (cardTypeName, templateName) =>
      `Add cards of type ${cardTypeName} to template ${templateName}`,
  )
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
    const templateResource = this.project.resources.byType(
      templateName,
      'templates',
    );
    const templateObject = templateResource.templateObject();
    const specificCard = card ? templateObject.findCard(card) : undefined;

    if (isModulePath(templateObject.templateFolder())) {
      throw new Error(`Cannot add cards to imported module templates`);
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
            throw new Error(result.reason);
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
   * Adds a new hub location.
   * @param hubUrl URL of the hub
   */
  @write((hubUrl) => `Add hub ${hubUrl}`)
  public async addHubLocation(hubUrl: string) {
    return this.project.configuration.addHub(hubUrl);
  }

  /**
   * Adds an attachment to a card.
   * @param cardKey card ID
   * @param attachment path to an attachment file or attachment name if buffer is defined
   * @param buffer (Optional) attachment buffer
   */
  @write((cardKey, attachment) => `Add attachment ${attachment} to ${cardKey}`)
  public async createAttachment(
    cardKey: string,
    attachment: string,
    buffer?: Buffer,
  ) {
    try {
      await this.project.createCardAttachment(
        cardKey,
        attachment,
        buffer || attachment,
      );
    } catch (error) {
      throw new Error(errorFunction(error));
    }
  }

  /**
   * Creates a calculation resource.
   * @param calculationName name for the calculation resource
   */
  @write((calculationName) => `Create calculation ${calculationName}`)
  public async createCalculation(calculationName: string) {
    return this.project.resources
      .byType(calculationName, 'calculations')
      .create();
  }

  /**
   * Creates card(s) to a project. All cards from template are instantiated to the project.
   * @param templateName name of a template to use
   * @param parentCardKey (Optional) card-key of a parent card. If missing, cards are added to the card root.
   * @returns array of card keys that were created. Cards are sorted by their parent key and rank. Template root cards are first but the order between other card groups is not guaranteed. However, the order of cards within a group is guaranteed to be ordered by rank.
   */
  @write((templateName) => `Create card from template ${templateName}`)
  public async createCard(
    templateName: string,
    parentCardKey?: string,
  ): Promise<Card[]> {
    const templateResource = this.project.resources.byType(
      templateName,
      'templates',
    );

    Validate.getInstance().validResourceName(
      'templates',
      resourceNameToString(resourceName(templateName)),
      this.project.allModulePrefixes(),
    );

    await templateResource.validate();

    const specificCard = parentCardKey
      ? this.project.findCard(parentCardKey)
      : undefined;
    const templateObject = templateResource.templateObject();
    if (!templateObject || !templateObject.isCreated()) {
      throw new Error(`Template '${templateName}' not found from project`);
    }

    const createdCards = await templateObject.createCards(specificCard);
    if (createdCards.length > 0) {
      const rootParent = specificCard?.key ?? ROOT;
      const rootCards: Card[] = [];
      const childCards: Card[] = [];
      for (const card of createdCards) {
        if (card.parent === rootParent) {
          rootCards.push(card);
        } else {
          childCards.push(card);
        }
      }
      return [
        ...sortItems(rootCards, (item) => item.metadata?.rank || EMPTY_RANK),
        ...childCards,
      ];
    }
    return [];
  }

  /**
   * Creates a card type.
   * @param cardTypeName name for the card type.
   * @param workflowName workflow name to use in the card type.
   */
  @write((cardTypeName) => `Create card type ${cardTypeName}`)
  public async createCardType(cardTypeName: string, workflowName: string) {
    return this.project.resources
      .byType(cardTypeName, 'cardTypes')
      .createCardType(workflowName);
  }

  /**
   * Creates a new field type.
   * @param fieldTypeName name for the field type.
   * @param dataType data type for the field type
   */
  @write((fieldTypeName) => `Create field type ${fieldTypeName}`)
  public async createFieldType(fieldTypeName: string, dataType: DataType) {
    return this.project.resources
      .byType(fieldTypeName, 'fieldTypes')
      .createFieldType(dataType);
  }

  /**
   * Creates a new graph model.
   * @param graphModelName name for the graph model.
   */
  @write((graphModelName) => `Create graph model ${graphModelName}`)
  public async createGraphModel(graphModelName: string) {
    return this.project.resources
      .byType(graphModelName, 'graphModels')
      .create();
  }

  /**
   * Creates a new graph view.
   * @param graphViewName name for the graph view.
   */
  @write((graphViewName) => `Create graph view ${graphViewName}`)
  public async createGraphView(graphViewName: string) {
    return this.project.resources.byType(graphViewName, 'graphViews').create();
  }

  /**
   * Creates  a label in the given card
   * @param cardKey The card to which the label is added to
   * @param label The label being added
   */
  @write((cardKey, label) => `Add label ${label} to ${cardKey}`)
  public async createLabel(cardKey: string, label: string) {
    if (!Validate.isValidLabelName(label)) {
      throw new Error(`Not a valid label name'`);
    }

    const card = this.project.findCard(cardKey);
    const labels = structuredClone(card.metadata?.labels) ?? [];

    if (labels.includes(label)) {
      throw new Error('Label already exists');
    }

    labels.push(label);
    return this.project.updateCardMetadataKey(cardKey, 'labels', labels);
  }

  /**
   * Creates a new link type.
   * @param linkTypeName name for the link type.
   */
  @write((linkTypeName) => `Create link type ${linkTypeName}`)
  public async createLinkType(linkTypeName: string) {
    return this.project.resources.byType(linkTypeName, 'linkTypes').create();
  }

  /**
   * Creates a link between two cards.
   * @param cardKey The card to update
   * @param destinationCardKey The card to link to
   * @param linkType The type of link to add
   * @param linkDescription Optional description of the link
   */
  @write(
    (cardKey, destinationCardKey, linkType) =>
      `Create ${linkType} link from ${cardKey} to ${destinationCardKey}`,
  )
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
    const card = this.project.findCard(cardKey);
    const destinationCard = this.project.findCard(destinationCardKey);
    // make sure the link type exists
    const linkTypeObject = this.project.resources
      .byType(linkType, 'linkTypes')
      .show();

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

    const links = card.metadata?.links || [];
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
   * @param projectCategory category for the project (empty string if not provided).
   * @param projectDescription description for the project (empty string if not provided).
   */
  public static async createProject(
    projectPath: string,
    projectPrefix: string,
    projectName: string,
    projectCategory: string,
    projectDescription: string,
  ) {
    // No lock required, since we are creating a new project
    projectPath = resolve(projectPath);

    if (!projectPath) {
      throw new Error('Cannot create project without a path');
    }

    // Create versioned structure: .cards/local/1/ is the initial draft (version 0 = nothing published yet)
    const projectFolders: string[] = [
      '.cards/local/1/calculations',
      '.cards/local/1/cardTypes',
      '.cards/local/1/fieldTypes',
      '.cards/local/1/graphModels',
      '.cards/local/1/graphViews',
      '.cards/local/1/linkTypes',
      '.cards/local/1/reports',
      '.cards/local/1/templates',
      '.cards/local/1/workflows',
      'cardRoot',
    ];

    if (!Validate.validateFolder(projectPath)) {
      throw new Error(
        `Input validation error: folder name '${projectPath}' is invalid`,
      );
    }

    if (
      projectPrefix === undefined ||
      projectPrefix.length < 3 ||
      projectPrefix.length > 10
    ) {
      throw new Error(
        `Input validation error: prefix must be from 3 to 10 characters long. '${projectPrefix}' does not fulfill the condition.`,
      );
    }
    if (!Validate.isValidProjectName(projectName)) {
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

    if (!Validate.isValidProjectName(projectName)) {
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

    await Promise.all(
      Create.JSONFileContent.map(async (entry) => {
        if ('cardKeyPrefix' in entry.content) {
          if (entry.content.cardKeyPrefix.includes('$PROJECT-PREFIX')) {
            entry.content.cardKeyPrefix = projectPrefix.toLowerCase();
          }
          if (entry.content.name.includes('$PROJECT-NAME')) {
            entry.content.name = projectName;
          }
          if (projectCategory) {
            entry.content.category = projectCategory;
          }
          if (projectDescription) {
            entry.content.description = projectDescription;
          }
        }
        await writeJsonFile(
          join(projectPath, entry.path, entry.name),
          entry.content,
        );
      }),
    );

    // Create .schema files for each resource folder
    const schemaFiles: Array<{ path: string; content: object[] }> = [
      {
        path: '.cards/local/1/calculations',
        content: [{ id: 'calculationSchema', version: 1 }],
      },
      {
        path: '.cards/local/1/cardTypes',
        content: [{ id: 'cardTypeSchema', version: 1 }],
      },
      {
        path: '.cards/local/1/fieldTypes',
        content: [{ id: 'fieldTypeSchema', version: 1 }],
      },
      {
        path: '.cards/local/1/graphModels',
        content: [{ id: 'graphModelSchema', version: 1 }],
      },
      {
        path: '.cards/local/1/graphViews',
        content: [{ id: 'graphViewSchema', version: 1 }],
      },
      {
        path: '.cards/local/1/linkTypes',
        content: [{ id: 'linkTypeSchema', version: 1 }],
      },
      {
        path: '.cards/local/1/reports',
        content: [{ id: 'reportMetadataSchema', version: 1 }],
      },
      {
        path: '.cards/local/1/templates',
        content: [{ id: 'templateSchema', version: 1 }],
      },
      {
        path: '.cards/local/1/workflows',
        content: [{ id: 'workflowSchema', version: 1 }],
      },
    ];

    await Promise.all(
      schemaFiles.map(async (entry) => {
        await writeJsonFile(
          join(projectPath, entry.path, '.schema'),
          entry.content,
        );
      }),
    );

    // Create empty migration log
    await ConfigurationLogger.clearLog(projectPath, 1);

    try {
      await writeFile(
        join(projectPath, '.gitignore'),
        this.gitIgnoreContent.join('\n') + '\n',
      );
    } catch {
      console.error('Failed to create project');
    }
  }

  /**
   * Creates a report
   * @param name name of the report
   */
  @write((name) => `Create report ${name}`)
  public async createReport(name: string) {
    return this.project.resources.byType(name, 'reports').createReport();
  }

  /**
   * Creates a new template to a project.
   * @param templateName Name of the template.
   * @param templateContent JSON content for the template file.
   */
  @write((templateName) => `Create template ${templateName}`)
  public async createTemplate(templateName: string, templateContent: string) {
    return this.project.resources
      .byType(templateName, 'templates')
      .create(templateContent ? JSON.parse(templateContent) : undefined);
  }

  /**
   * Publishes the current draft as a new version and creates a new draft folder.
   *
   * 1. Checks that latestVersion > published version (something to release).
   * 2. Checks that the migration log for latestVersion has entries.
   * 3. Validates the project.
   * 4. Sets cardsConfig.version = latestVersion (publishes draft).
   * 5. Creates a new folder (latestVersion + 1) by copying from latestVersion.
   * 6. Clears migration log in the new folder.
   * 7. Invalidates version cache.
   *
   * @throws if there is nothing to release
   */
  public async createVersion() {
    const latestVersion = this.project.configuration.latestVersion;
    const publishedVersion = this.project.configuration.version;

    // Nothing to release if latest folder is not ahead of published version
    if (latestVersion <= publishedVersion) {
      throw new Error(
        'Nothing to release. The latest version is already published.',
      );
    }

    this.logger.info(
      { publishedVersion, latestVersion },
      'Publishing draft as new version',
    );

    // Publish and advance to next draft
    await this.project.configuration.publish();
    const newDraft = await this.project.configuration.createNextDraft();
    await ConfigurationLogger.clearLog(this.project.basePath, newDraft);
    this.project.resources.changed();

    this.logger.info(
      {
        previousVersion: publishedVersion,
        newVersion: latestVersion,
        newDraft,
      },
      'Version published successfully',
    );

    return {
      previousVersion: publishedVersion,
      newVersion: latestVersion,
    };
  }

  /**
   * Creates a workflow.
   * @param workflowName workflow name
   * @param workflowContent workflow content JSON
   */
  @write((workflowName) => `Create workflow ${workflowName}`)
  public async createWorkflow(workflowName: string, workflowContent: string) {
    return this.project.resources
      .byType(workflowName, 'workflows')
      .create(workflowContent ? JSON.parse(workflowContent) : undefined);
  }
}
