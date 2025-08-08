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
import { basename, join, resolve, sep } from 'node:path';
import {
  constants as fsConstants,
  copyFile,
  mkdir,
  writeFile,
} from 'node:fs/promises';

import { errorFunction } from '../utils/log-utils.js';
import { Project } from '../containers/project.js';
import { Validate } from './index.js';

import { EMPTY_RANK, sortItems } from '../utils/lexorank.js';
import type {
  DataType,
  Link,
  LinkType,
} from '../interfaces/resource-interfaces.js';
import { pathExists } from '../utils/file-utils.js';
import type { Card, ProjectFile } from '../interfaces/project-interfaces.js';
import { resourceName, resourceNameToString } from '../utils/resource-utils.js';
import { writeJsonFile } from '../utils/json.js';

import { CardTypeResource } from '../resources/card-type-resource.js';
import { FieldTypeResource } from '../resources/field-type-resource.js';
import { GraphModelResource } from '../resources/graph-model-resource.js';
import { GraphViewResource } from '../resources/graph-view-resource.js';
import { LinkTypeResource } from '../resources/link-type-resource.js';
import { ReportResource } from '../resources/report-resource.js';
import { TemplateResource } from '../resources/template-resource.js';
import { WorkflowResource } from '../resources/workflow-resource.js';

// todo: Is there a easy to way to make JSON schema into a TypeScript interface/type?
//       Check this out: https://www.npmjs.com/package/json-schema-to-ts

/**
 * Handles all create commands.
 */
export class Create {
  constructor(private project: Project) {}

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
        modules: [],
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
    const templateResource = new TemplateResource(
      this.project,
      resourceName(templateName),
    );
    const templateObject = templateResource.templateObject();

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
   * Creates card(s) to a project. All cards from template are instantiated to the project.
   * @param templateName name of a template to use
   * @param parentCardKey (Optional) card-key of a parent card. If missing, cards are added to the card root.
   * @returns array of card keys that were created. Cards are sorted by their parent key and rank. Template root cards are first but the order between other card groups is not guaranteed. However, the order of cards within a group is guaranteed to be ordered by rank.
   */
  public async createCard(
    templateName: string,
    parentCardKey?: string,
  ): Promise<Card[]> {
    const templateResource = new TemplateResource(
      this.project,
      resourceName(templateName),
    );

    await Validate.getInstance().validResourceName(
      'templates',
      resourceNameToString(resourceName(templateName)),
      await this.project.projectPrefixes(),
    );

    await templateResource.validate();

    const specificCard = parentCardKey
      ? await this.project.findSpecificCard(parentCardKey, {
          metadata: true,
          children: true,
        })
      : undefined;
    if (parentCardKey && !specificCard) {
      throw new Error(`Card '${parentCardKey}' not found from project`);
    }

    const templateObject = templateResource.templateObject();
    if (!templateObject || !templateObject.isCreated()) {
      throw new Error(`Template '${templateName}' not found from project`);
    }

    const createdCards = await templateObject.createCards(specificCard);
    if (createdCards.length > 0) {
      await this.project.handleNewCards(createdCards);
      // Note: This assumes that parent keys will be ahead of 'a' in the sort order.
      const sorted = sortItems(createdCards, (item) => {
        return `${item.parent === 'root' ? 'a' : item.parent}${item.metadata?.rank || EMPTY_RANK}`;
      });
      return sorted;
    }
    return [];
  }

  /**
   * Creates a card type.
   * @param cardTypeName name for the card type.
   * @param workflowName workflow name to use in the card type.
   */
  public async createCardType(cardTypeName: string, workflowName: string) {
    const cardType = new CardTypeResource(
      this.project,
      resourceName(cardTypeName),
    );

    await cardType.createCardType(workflowName);
  }

  /**
   * Creates a new field type.
   * @param fieldTypeName name for the field type.
   * @param dataType data type for the field type
   */
  public async createFieldType(fieldTypeName: string, dataType: DataType) {
    const fieldType = new FieldTypeResource(
      this.project,
      resourceName(fieldTypeName),
    );
    await fieldType.createFieldType(dataType);
  }

  /**
   * Creates a new graph model.
   * @param graphModelName name for the graph model.
   */
  public async createGraphModel(graphModelName: string) {
    const graphModel = new GraphModelResource(
      this.project,
      resourceName(graphModelName),
    );
    await graphModel.create();
  }

  /**
   * Creates a new graph view.
   * @param graphModelName name for the graph view.
   */
  public async createGraphView(graphViewName: string) {
    const graphView = new GraphViewResource(
      this.project,
      resourceName(graphViewName),
    );
    await graphView.create();
  }

  /**
   * Creates  a label in the given card
   * @param cardKey The card to which the label is added to
   * @param label The label being added
   */
  public async createLabel(cardKey: string, label: string) {
    if (!Validate.isValidLabelName(label)) {
      throw new Error(`Not a valid label name'`);
    }

    const card = await this.project.findSpecificCard(cardKey, {
      metadata: true,
    });
    if (!card) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }
    const labels = card.metadata?.labels ?? [];

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
  public async createLinkType(linkTypeName: string) {
    const linkType = new LinkTypeResource(
      this.project,
      resourceName(linkTypeName),
    );
    await linkType.create();
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
    const linkTypeObject = await this.project.resource<LinkType>(linkType);
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
   */
  public static async createProject(
    projectPath: string,
    projectPrefix: string,
    projectName: string,
  ) {
    projectPath = resolve(projectPath);

    if (!projectPath) {
      throw new Error('Cannot create project without a path');
    }

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
  public async createReport(name: string) {
    const report = new ReportResource(this.project, resourceName(name));
    await report.createReport();
  }

  /**
   * Creates a new template to a project.
   * @param templateName Name of the template.
   * @param templateContent JSON content for the template file.
   */
  public async createTemplate(templateName: string, templateContent: string) {
    const template = new TemplateResource(
      this.project,
      resourceName(templateName),
    );

    await template.create(
      templateContent ? JSON.parse(templateContent) : undefined,
    );
  }

  /**
   * Creates a workflow.
   * @param workflowName workflow name
   * @param workflowContent workflow content JSON
   */
  public async createWorkflow(workflowName: string, workflowContent: string) {
    const workflow = new WorkflowResource(
      this.project,
      resourceName(workflowName),
    );

    await workflow.create(
      workflowContent ? JSON.parse(workflowContent) : undefined,
    );
  }
}
