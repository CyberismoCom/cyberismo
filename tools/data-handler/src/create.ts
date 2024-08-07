// node
import { basename, dirname, join, resolve, sep } from 'node:path';
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
  projectFile,
  templateMetadata,
  workflowCategory,
  workflowMetadata,
} from './interfaces/project-interfaces.js';
import { errorFunction } from './utils/log-utils.js';
import { formatJson, readJsonFile, readJsonFileSync } from './utils/json.js';
import { pathExists } from './utils/file-utils.js';
import { Project } from './containers/project.js';
import { Template } from './containers/template.js';
import { Validate } from './validate.js';
import { fileURLToPath } from 'node:url';

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
        nextAvailableCardNumber: 1,
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
   * @returns string with information about the operation
   */
  public async addCards(
    projectPath: string,
    cardTypeName: string,
    templateName: string,
    card?: string,
    count: number = 1,
  ): Promise<string> {
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
      promiseContainer.push(
        await templateObject.addCard(cardTypeName, specificCard),
      );
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
      const messageTxt =
        count > 1
          ? `${count} cards were added to the template '${templateName} : ${JSON.stringify(cardsContainer)}'`
          : `card '${cardsContainer[0]}' was added to the template '${templateName}'`;
      return messageTxt;
    } else {
      throw new Error('Unknown error');
    }
  }

  /**
   * Adds an attachment to a card.
   * @param {string} cardKey card ID
   * @param {string} projectPath path to a project
   * @param {string} attachment path to an attachment
   */
  public async createAttachment(
    cardKey: string,
    projectPath: string,
    attachment: string,
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
        return await copyFile(
          attachment,
          join(attachmentFolder, basename(attachment)),
          fsConstants.COPYFILE_EXCL,
        );
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
   * @returns array of card keys that were created.
   */
  public async createCard(
    projectPath: string,
    templateName: string,
    parentCardKey: string,
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
      throw new Error(`invalid path '${projectPath}'`);
    }

    const templateObject =
      await projectObject.createTemplateObjectByName(templateName);
    if (!templateObject || !templateObject.isCreated()) {
      throw new Error(`Template '${templateName}' not found from project`);
    }

    const validator = Validate.getInstance();
    const content = await readJsonFile(
      templateObject.templateConfigurationFilePath(),
    );
    const validJson = await validator.validateJson(content, 'template-schema');
    if (validJson.length !== 0) {
      throw new Error(`Invalid template JSON: ${validJson}`);
    }

    const specificCard = parentCardKey
      ? await projectObject.findSpecificCard(parentCardKey)
      : undefined;
    if (parentCardKey && !specificCard) {
      throw new Error(`Card '${parentCardKey}' not found from project`);
    }

    const createdCards = await templateObject.createCards(specificCard);
    if (createdCards.length > 0) {
      this.emit('created', createdCards);
    }
    return createdCards.map((item) => item.key);
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

    const content: cardtype = { name, workflow };
    const destinationFolder = join(
      projectPath,
      '.cards',
      'local',
      'cardtypes',
      `${content.name}.json`,
    );
    await writeFile(destinationFolder, formatJson(content), {
      encoding: 'utf-8',
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
    const content: fieldtype = { name: fieldTypeName, dataType: dataType };

    if (await this.fieldTypeExists(projectPath, fieldTypeName)) {
      throw new Error(
        `Field type with name '${fieldTypeName}' already exists in the project`,
      );
    }
    if (!Create.supportedFieldTypes().includes(dataType)) {
      throw new Error(
        `Field type '${dataType}' not supported. Supported types ${Create.supportedFieldTypes()}`,
      );
    }

    const destinationFolder = join(
      projectPath,
      '.cards',
      'local',
      'fieldtypes',
      `${content.name}.json`,
    );
    await writeFile(destinationFolder, formatJson(content), {
      encoding: 'utf-8',
      flag: 'wx',
    });
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
      ['calculations', 'cardtypes', 'fieldtypes', 'templates', 'workflows'],
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
      await writeFile(
        join(parentFolderToCreate, entry.path, entry.name),
        formatJson(entry.content),
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
    } catch (e) {
      console.error('Failed to create project');
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
    const validJson = await validator.validateJson(
      templateContent,
      'template-schema',
    );
    if (validJson.length !== 0) {
      throw new Error(`Invalid template JSON: ${validJson}`);
    }

    const project = new Project(projectPath);
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
    const validJson = await validator.validateJson(workflow, schemaId);
    if (validJson.length !== 0) {
      throw new Error(`Invalid workflow JSON: ${validJson}`);
    }
    const content = JSON.parse(JSON.stringify(workflow));
    const destinationFile = join(
      projectPath,
      '.cards',
      'local',
      'workflows',
      `${content.name}.json`,
    );
    await writeFile(destinationFile, formatJson(content), { flag: 'wx' });
  }

  /**
   * Default content for template.json values.
   * @returns Default content for template.json values.
   */
  public static defaultTemplateContent(): templateMetadata {
    return {
      buttonLabel: 'Button',
      namePrompt: 'Prompt',
    };
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
   * Returns a list of supported field types.
   * @returns list of supported field types.
   */
  public static supportedFieldTypes(): string[] {
    const baseDir = dirname(fileURLToPath(import.meta.url));

    const baseFolder = pathExists(
      join(process.cwd(), '../schema', 'cardtree-directory-schema.json'),
    )
      ? join(process.cwd(), '../schema')
      : join(baseDir, '../../schema');

    const schemaContent = readJsonFileSync(
      join(baseFolder, 'field-type-schema.json'),
    );
    return schemaContent.properties.dataType.pattern
      .replace(/\$|\^/g, '')
      .split('|');
  }
}
