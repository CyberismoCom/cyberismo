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

// ismo
import { Calculate } from './calculate.js';
import {
  cardtype,
  fieldtype,
  link,
  projectFile,
  templateMetadata,
  workflowCategory,
  workflowMetadata,
} from './interfaces/project-interfaces.js';
import { errorFunction } from './utils/log-utils.js';
import { readJsonFile, writeJsonFile } from './utils/json.js';
import { Project } from './containers/project.js';
import { Template } from './containers/template.js';
import { Validate } from './validate.js';
import { EMPTY_RANK, sortItems } from './utils/lexorank.js';

// todo: Is there a easy to way to make JSON schema into a TypeScript interface/type?
//       Check this out: https://www.npmjs.com/package/json-schema-to-ts

/**
 * Handles all creation operations.
 * Resources that it can create include attachments, cards, cardroots, projects, templates and workflows.
 */
export class Create extends EventEmitter {
  private calculateCmd: Calculate;

  constructor(calculateCmd: Calculate) {
    super();

    this.calculateCmd = calculateCmd;
    this.addListener(
      'created',
      this.calculateCmd.handleNewCards.bind(this.calculateCmd),
    );
  }

  schemaFilesContent: projectFile[] = [
    {
      path: '.cards/local',
      content: { id: 'cardsconfig-schema', version: 1 },
      name: Project.schemaContentFile,
    },
    {
      path: '.cards/local',
      content: {
        name: '$PROJECT-NAME',
        cardkeyPrefix: '$PROJECT-PREFIX',
      },
      name: Project.projectConfigFileName,
    },
    {
      path: '.cards/local/cardtypes',
      content: { id: '/cardtype-schema', version: 1 },
      name: Project.schemaContentFile,
    },
    {
      path: '.cards/local/fieldtypes',
      content: { id: 'field-type-schema', version: 1 },
      name: Project.schemaContentFile,
    },
    {
      path: '.cards/local/linktypes',
      content: { id: 'link-type-schema', version: 1 },
      name: Project.schemaContentFile,
    },
    {
      path: '.cards/local/workflows',
      content: { id: 'workflow-schema', version: 1 },
      name: Project.schemaContentFile,
    },
  ];

  gitIgnoreContent: string = `.calc\n
        .asciidoctor\n
        .vscode\n
        *.html\n
        *.pdf\n
        *.puml\n
        **/.DS_Store\n
        *-debug.log\n
        *-error.log\n`;

  gitKeepContent: string = '';

  // Checks if fieldtype is created to a project.
  // todo: we could have generic 'does resource exists' in Project
  private async fieldTypeExists(
    path: string,
    fieldTypeName: string,
  ): Promise<boolean> {
    const project = new Project(path);
    const fieldType = (await project.fieldtypes()).find(
      (item) =>
        item.name === fieldTypeName + '.json' || item.name === fieldTypeName,
    );
    return fieldType ? true : false;
  }

  private async linkTypeExists(
    path: string,
    linkTypeName: string,
  ): Promise<boolean> {
    const project = new Project(path);
    const linkType = (await project.linkTypes()).find(
      (item) =>
        item.name === linkTypeName + '.json' || item.name === linkTypeName,
    );
    return linkType ? true : false;
  }

  // Checks if workflow is created to a project.
  private async workflowExists(
    path: string,
    workflowName: string,
  ): Promise<boolean> {
    const project = new Project(path);
    const workflow = (await project.workflows()).find(
      (item) =>
        item.name === workflowName + '.json' || item.name === workflowName,
    );
    return workflow ? true : false;
  }

  /**
   * Adds new cards to a template.
   * @param {string} projectPath Project path.
   * @param {string} cardTypeName Card-type for new cards.
   * @param {string} templateName Template name to add cards into.
   * @param {string} card Optional, if defined adds a new child-card under the card.
   * @param {number} count How many cards to add. By default one.
   * @returns non-empty string array with ids of added cards
   */
  public async addCards(
    projectPath: string,
    cardTypeName: string,
    templateName: string,
    card?: string,
    count: number = 1,
  ): Promise<string[]> {
    // Use slice to get a copy of a string.
    const origTemplateName = templateName.slice(0);
    templateName = Template.normalizedTemplateName(templateName);
    if (templateName === '') {
      throw Error(`Template '${origTemplateName}' is invalid template name`);
    }
    const templateObject = new Template(projectPath, { name: templateName });

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
   * @param {string} cardKey card ID
   * @param {string} projectPath path to a project
   * @param {string} attachment path to an attachment file or attachment name if buffer is defined
   * @param {Buffer} buffer (Optional) attachment buffer
   */
  public async createAttachment(
    cardKey: string,
    projectPath: string,
    attachment: string,
    buffer?: Buffer,
  ) {
    const project = new Project(projectPath);
    const attachmentFolder = await project.cardAttachmentFolder(cardKey);
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
   * @param {string} projectPath project path
   * @param {string} templateName name of a template to use
   * @param {string} parentCardKey (Optional) card-key of a parent card. If missing, cards are added to the cardroot.
   * @returns array of card keys that were created. Cards are sorted by their parent key and rank. Template root cards are first but the order between other card groups is not guaranteed. However, the order of cards within a group is guaranteed to be ordered by rank.
   */
  public async createCard(
    projectPath: string,
    templateName: string,
    parentCardKey?: string,
  ): Promise<string[]> {
    // todo: should validator validate the whole schema before creating a new card to it?
    //       this might keep the integrity and consistency of the project more easily valid.

    if (!Project.isCreated(projectPath)) {
      throw new Error(`Not a project: '${projectPath}'`);
    }

    let projectObject: Project;
    try {
      projectObject = new Project(projectPath);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Invalid path '${projectPath}'`);
      }
      return [];
    }

    const templateObject =
      await projectObject.createTemplateObjectByName(templateName);
    if (!templateObject || !templateObject.isCreated()) {
      throw new Error(`Template '${templateName}' not found from project`);
    }

    const validator = Validate.getInstance();
    const content = (await readJsonFile(
      templateObject.templateConfigurationFilePath(),
    )) as templateMetadata;
    const validJson = validator.validateJson(content, 'template-schema');
    if (validJson.length !== 0) {
      throw new Error(`Invalid template JSON: ${validJson}`);
    }

    const specificCard = parentCardKey
      ? await projectObject.findSpecificCard(parentCardKey, {
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
        return `${item.parent === templateName ? 'a' : item.parent}${item.metadata?.rank || EMPTY_RANK}`;
      });
      return sorted.map((item) => item.key);
    }
    return [];
  }

  /**
   * Creates a cardtype.
   * @param {string} projectPath project path.
   * @param {string} name name for the cardtype.
   * @param {string} workflow workflow name to use in the cardtype.
   */
  public async createCardtype(
    projectPath: string,
    name: string,
    workflow: string,
  ) {
    if (!(await this.workflowExists(projectPath, workflow))) {
      throw new Error(
        `Input validation error: workflow '${workflow}' does not exist in the project.`,
      );
    }

    const project = new Project(projectPath);
    const fullName = `${project.projectPrefix}/cardtypes/${name}`;
    const fullFileName = `.cards/local/cardtypes/${name}.json`;

    const content: cardtype = { name: fullName, workflow };
    const destinationFolder = join(projectPath, fullFileName);
    await writeJsonFile(destinationFolder, content, {
      flag: 'wx',
    });
  }

  /**
   * Creates a new fieldtype.
   * @param {string} projectPath project path
   * @param {string} fieldTypeName name for the fieldtype
   * @param {string} dataType data type for the fieldtype
   */
  public async createFieldType(
    projectPath: string,
    fieldTypeName: string,
    dataType: string,
  ) {
    const content: fieldtype = {
      name: `local/fieldtypes/${fieldTypeName}`,
      dataType: dataType,
    };

    if (await this.fieldTypeExists(projectPath, fieldTypeName)) {
      throw new Error(
        `Field type with name '${fieldTypeName}' already exists in the project`,
      );
    }
    if (!Create.supportedFieldTypes().includes(dataType)) {
      throw new Error(
        `Field type '${dataType}' not supported. Supported types ${Create.supportedFieldTypes().join(', ')}`,
      );
    }

    const destinationFolder = join(
      projectPath,
      '.cards',
      `${content.name}.json`,
    );
    await writeJsonFile(destinationFolder, content, {
      flag: 'wx',
    });
  }

  /**
   * Creates a new linktype.
   * @param {string} projectPath project path
   * @param {string} linkTypeName name for the linktype
   * @param {string} linkTypeContent JSON content for the linktype
   */
  public async createLinkType(projectPath: string, linkTypeName: string) {
    // check if linktype already exists
    if (await this.linkTypeExists(projectPath, linkTypeName)) {
      throw new Error(
        `Link type with name '${linkTypeName}' already exists in the project`,
      );
    }

    const linkTypeContent = Create.getLinkTypeContent(linkTypeName);
    // check if linktype JSON is valid
    const validator = Validate.getInstance();
    const validJson = validator.validateJson(
      linkTypeContent,
      'link-type-schema',
    );
    if (validJson.length !== 0) {
      throw new Error(`Invalid linktype JSON: ${validJson}`);
    }

    const destinationFolder = join(
      projectPath,
      '.cards',
      'local',
      'linktypes',
      `${linkTypeName}.json`,
    );
    await writeJsonFile(destinationFolder, linkTypeContent, {
      flag: 'wx',
    });
  }

  /**
   * Creates a link between two cards.
   * @param projectPath The path to the project containing the card
   * @param cardKey The card to update
   * @param destinationCardKey The card to link to
   * @param linkType The type of link to add
   * @param linkDescription Optional description of the link
   */
  public async createLink(
    projectPath: string,
    cardKey: string,
    destinationCardKey: string,
    linkType: string,
    linkDescription?: string,
  ) {
    const project = new Project(projectPath);

    // Determine the card path

    const card = await project.findSpecificCard(cardKey, {
      metadata: true,
    });
    if (!card) {
      throw new Error(`Card '${cardKey}' does not exist in the project`);
    }

    const destinationCard = await project.findSpecificCard(destinationCardKey, {
      metadata: true,
    });
    if (!destinationCard) {
      throw new Error(
        `Card '${destinationCardKey}' does not exist in the project`,
      );
    }
    // make sure the link type exists
    const linkTypeObject = await project.linkType(linkType);

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

    // make sure source cardkey exists in the linktype sourceCardTypes
    // if sourceCardTypes is empty, any card can be linked
    if (
      linkTypeObject.sourceCardTypes.length > 0 &&
      !linkTypeObject.sourceCardTypes.includes(card.metadata?.cardtype || '')
    ) {
      throw new Error(
        `Card type '${card.metadata?.cardtype}' cannot be linked with link type '${linkType}'`,
      );
    }

    // make sure destination cardkey exists in the linktype destinationCardTypes
    // if destinationCardTypes is empty, any card can be linked
    if (
      linkTypeObject.destinationCardTypes.length > 0 &&
      !linkTypeObject.destinationCardTypes.includes(
        destinationCard.metadata!.cardtype,
      )
    ) {
      throw new Error(
        `Card type '${destinationCard.metadata!.cardtype}' cannot be linked with link type '${linkType}'`,
      );
    }

    // if contains the same link, do not add it again
    const existingLink = card.metadata?.links?.find(
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

    const links: link[] = card.metadata?.links || [];
    links.push({
      linkType,
      cardKey: destinationCardKey,
      linkDescription,
    });

    await project.updateCardMetadataKey(cardKey, 'links', links);
  }

  /**
   * Creates a new project.
   * @param {string} projectPath where to create the project.
   * @param {string} projectPrefix prefix for the project.
   * @param {string} projectName name for the project.
   */
  public async createProject(
    projectPath: string,
    projectPrefix: string,
    projectName: string,
  ) {
    projectPath = resolve(projectPath);
    const projectFolders: string[] = ['.cards/local', 'cardroot'];
    const projectSubFolders: string[][] = [
      [
        'calculations',
        'cardtypes',
        'fieldtypes',
        'linktypes',
        'templates',
        'workflows',
      ],
      [],
    ];
    const parentFolderToCreate = join(projectPath);

    if (Project.isCreated(projectPath)) {
      throw new Error('Project already exists');
    }

    await mkdir(parentFolderToCreate, { recursive: true })
      .then(async () => {
        return await Promise.all(
          projectFolders.map((folder) =>
            mkdir(`${parentFolderToCreate}/${folder}`, { recursive: true }),
          ),
        );
      })
      .then(async () => {
        projectSubFolders.forEach((subFolders, index) => {
          subFolders.forEach((subFolder) => {
            const parent = join(parentFolderToCreate, projectFolders[index]);
            return mkdir(`${parent}/${subFolder}`);
          });
        });
      });

    this.schemaFilesContent.forEach(async (entry) => {
      if (entry.content.cardkeyPrefix?.includes('$PROJECT-PREFIX')) {
        entry.content.cardkeyPrefix = projectPrefix.toLowerCase();
      }
      if (entry.content.name?.includes('$PROJECT-NAME')) {
        entry.content.name = projectName;
      }
      await writeJsonFile(
        join(parentFolderToCreate, entry.path, entry.name),
        entry.content,
      );
    });

    await writeFile(join(projectPath, '.gitignore'), this.gitIgnoreContent);

    try {
      const project = new Project(projectPath);
      await writeFile(
        join(project.calculationProjectFolder, '.gitkeep'),
        this.gitKeepContent,
      );
      await writeFile(
        join(project.fieldtypesFolder, '.gitkeep'),
        this.gitKeepContent,
      );
    } catch (error) {
      if (error instanceof Error) {
        console.error('Failed to create project');
      }
    }
  }

  /**
   * Creates a new template to a project.
   * @param {string} projectPath Project path
   * @param {string} templateName Name of the template
   * @param {templateMetadata} templateContent JSON content for the template file.
   */
  public async createTemplate(
    projectPath: string,
    templateName: string,
    templateContent: templateMetadata,
  ) {
    // Use slice to get a copy of a string.
    const origTemplateName = templateName.slice(0);
    templateName = Template.normalizedTemplateName(templateName);
    if (templateName === '') {
      throw new Error(
        `Template '${origTemplateName}' is invalid template name`,
      );
    }

    const validator = Validate.getInstance();
    const validJson = validator.validateJson(
      templateContent,
      'template-schema',
    );
    if (validJson.length !== 0) {
      throw new Error(`Invalid template JSON: ${validJson}`);
    }

    const project = new Project(projectPath);
    // todo: Move this somewhere? This could be part of template or project? or utiliity class
    // Only allow 'local' or module/project name in multipart names.
    const parts = templateName.split('/');
    if (parts.length > 1) {
      if (parts[0] !== 'local' && parts[0] !== project.projectPrefix) {
        throw new Error('Invalid name');
      }
    }

    if (await project.templateExists(templateName)) {
      throw new Error(
        `Template '${templateName}' already exists in the project`,
      );
    }

    const template = new Template(projectPath, { name: templateName });
    await template.create(templateContent);
  }

  /**
   * Creates a workflow.
   * @param {string} projectPath project path
   * @param {workflowMetadata} workflow workflow JSON
   */
  public async createWorkflow(projectPath: string, workflow: workflowMetadata) {
    const validator = Validate.getInstance();
    const schemaId = 'workflow-schema';
    const project = new Project(projectPath);
    const fullName = `${project.projectPrefix}/workflows/${workflow.name}`;
    const fullFileName = `.cards/local/workflows/${workflow.name}.json`;
    workflow.name = fullName;
    const validJson = validator.validateJson(workflow, schemaId);
    if (validJson.length !== 0) {
      throw new Error(`Invalid workflow JSON: ${validJson}`);
    }
    const content = JSON.parse(JSON.stringify(workflow)) as workflowMetadata;
    const destinationFile = join(projectPath, fullFileName);
    await writeJsonFile(destinationFile, content, { flag: 'wx' });
  }

  /**
   * Default content for template.json values.
   * @returns Default content for template.json values.
   */
  public static defaultTemplateContent(): templateMetadata {
    return {};
  }

  /**
   * Default content for workflow JSON values.
   * @param {string} workflowName workflow name
   * @returns Default content for workflow JSON values.
   */
  public static defaultWorkflowContent(workflowName: string): workflowMetadata {
    return {
      name: workflowName,
      states: [
        { name: 'Draft', category: workflowCategory.initial },
        { name: 'Approved', category: workflowCategory.closed },
        { name: 'Deprecated', category: workflowCategory.closed },
      ],
      transitions: [
        {
          name: 'Create',
          fromState: [''],
          toState: 'Draft',
        },
        {
          name: 'Approve',
          fromState: ['Draft'],
          toState: 'Approved',
        },
        {
          name: 'Archive',
          fromState: ['*'],
          toState: 'Deprecated',
        },
      ],
    };
  }

  /**
   * Default content for linktype JSON values.
   * @param {string} linkTypeName linktype name
   * @returns Default content for linktype JSON values.
   */
  public static getLinkTypeContent(linkTypeName: string) {
    return {
      name: linkTypeName,
      outboundDisplayName: linkTypeName,
      inboundDisplayName: linkTypeName,
      sourceCardTypes: [],
      destinationCardTypes: [],
      enableLinkDescription: false,
    };
  }

  /**
   * Returns a list of supported field types.
   * @returns list of supported field types.
   */
  public static supportedFieldTypes(): string[] {
    return [
      'shorttext',
      'longtext',
      'number',
      'integer',
      'boolean',
      'enum',
      'list',
      'date',
      'datetime',
      'person',
    ];
  }
}
