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
import { basename, join, resolve } from 'node:path';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';

import { SCHEMA_VERSION } from '@cyberismo/migrations';
import { scanForProjects } from '../project-scanner.js';
import { createGit, gitTimeout } from '../utils/git-config.js';
import { pathExists } from '../utils/file-utils.js';
import { Checkout } from '../containers/project.js';
import {
  addTemplateCards,
  instantiateTemplate,
} from '../containers/project/template-instantiation.js';
import { Validate } from './validate.js';

import { compare, EMPTY_RANK, sortItems } from '../utils/lexorank.js';
import { ROOT } from '../utils/constants.js';
import type { DataType, Card, ProjectFile } from '@cyberismo/model';
import { resourceName, resourceNameToString } from '../utils/resource-utils.js';
import { write } from '../utils/rw-lock.js';
import { writeJsonFile } from '../utils/json.js';
import { getChildLogger } from '../utils/log-utils.js';
import { runCreationSideEffects } from '../cards/transition.js';

const logger = getChildLogger({ module: 'create' });

// todo: Is there a easy to way to make JSON schema into a TypeScript interface/type?
//       Check this out: https://www.npmjs.com/package/json-schema-to-ts

/**
 * Handles all create commands.
 */
export class Create {
  constructor(private checkout: Checkout) {}

  static JSONFileContent: ProjectFile[] = [
    {
      path: '.cards/local',
      content: [{ id: 'cardsConfigSchema', version: 1 }],
      name: Checkout.schemaContentFile,
    },
    {
      path: '.cards/local',
      content: {
        schemaVersion: SCHEMA_VERSION,
        cardKeyPrefix: '$PROJECT-PREFIX',
        name: '$PROJECT-NAME',
        description: '',
        modules: [],
        hubs: [],
      },
      name: Checkout.projectConfigFileName,
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
      !Validate.validateFolder(join(this.checkout.basePath, templateName))
    ) {
      throw new Error(
        `Input validation error: template name is invalid '${templateName}'`,
      );
    }
    if (cardTypeName === undefined) {
      throw new Error(`Input validation error: card type cannot be empty`);
    }
    const templateResource = this.checkout.resources.byType(
      templateName,
      'templates',
    );
    const specificCard = card
      ? templateResource.cardTree.card(card)
      : undefined;

    if (!templateResource.isCreated()) {
      throw new Error(`Template '${templateResource.fullName}' does not exist`);
    }

    const cardsContainer = await addTemplateCards(
      this.checkout,
      templateResource.cardTree,
      cardTypeName,
      count,
      specificCard,
    );

    if (cardsContainer.length === 0) {
      throw new Error(`Invalid value for 'repeat:' "${count}"`);
    }

    await runCreationSideEffects(this.checkout, cardsContainer);

    return cardsContainer;
  }

  /**
   * Adds a new hub location.
   * @param hubUrl URL of the hub
   */
  @write((hubUrl) => `Add hub ${hubUrl}`)
  public async addHubLocation(hubUrl: string) {
    return this.checkout.configuration.addHub(hubUrl);
  }

  /**
   * Creates a calculation resource.
   * @param calculationName name for the calculation resource
   */
  @write((calculationName) => `Create calculation ${calculationName}`)
  public async createCalculation(calculationName: string) {
    return this.checkout.resources
      .byType(calculationName, 'calculations')
      .create();
  }

  /**
   * Creates card(s) to a project. All cards from template are instantiated to the project.
   * @param templateName name of a template to use
   * @param parentCardKey (Optional) card-key of a parent card. If missing, cards are added to the card root.
   * @returns the cards that were created. Template root cards come first, in rank order; the rest follow, grouped by parent key and in rank order within a group.
   */
  @write((templateName) => `Create card from template ${templateName}`)
  public async createCard(
    templateName: string,
    parentCardKey?: string,
  ): Promise<Card[]> {
    const templateResource = this.checkout.resources.byType(
      templateName,
      'templates',
    );

    Validate.getInstance().validResourceName(
      'templates',
      resourceNameToString(resourceName(templateName)),
      this.checkout.allModulePrefixes(),
    );

    await templateResource.validate();

    const specificCard = parentCardKey
      ? this.checkout.findCard(parentCardKey)
      : undefined;
    if (!templateResource.isCreated()) {
      throw new Error(`Template '${templateName}' not found from project`);
    }

    const createdCards = await instantiateTemplate(
      this.checkout,
      templateResource.cardTree,
      specificCard,
    );
    if (createdCards.length > 0) {
      await runCreationSideEffects(
        this.checkout,
        createdCards.map((card) => card.key),
      );

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
      const rankOf = (card: Card) => card.metadata?.rank || EMPTY_RANK;
      return sortItems(rootCards, rankOf).concat(
        childCards.toSorted(
          (a, b) =>
            compare(a.parent, b.parent) ||
            compare(rankOf(a), rankOf(b)) ||
            compare(a.key, b.key),
        ),
      );
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
    return this.checkout.resources
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
    return this.checkout.resources
      .byType(fieldTypeName, 'fieldTypes')
      .createFieldType(dataType);
  }

  /**
   * Creates a new graph model.
   * @param graphModelName name for the graph model.
   */
  @write((graphModelName) => `Create graph model ${graphModelName}`)
  public async createGraphModel(graphModelName: string) {
    return this.checkout.resources
      .byType(graphModelName, 'graphModels')
      .create();
  }

  /**
   * Creates a new graph view.
   * @param graphViewName name for the graph view.
   */
  @write((graphViewName) => `Create graph view ${graphViewName}`)
  public async createGraphView(graphViewName: string) {
    return this.checkout.resources.byType(graphViewName, 'graphViews').create();
  }

  /**
   * Creates a new link type.
   * @param linkTypeName name for the link type.
   */
  @write((linkTypeName) => `Create link type ${linkTypeName}`)
  public async createLinkType(linkTypeName: string) {
    return this.checkout.resources.byType(linkTypeName, 'linkTypes').create();
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

    const projectFolders: string[] = ['.cards/local', 'cardRoot'];

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

    if (Checkout.isCreated(projectPath)) {
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
      // Deep clone to avoid mutating the static template
      structuredClone(Create.JSONFileContent).map(
        async (entry: ProjectFile) => {
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
        },
      ),
    );

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
   * Clones a git repository into the given destination directory.
   * Clones to a temporary location first, validates that the repository
   * contains at least one Cyberismo project, then moves it to the final path.
   * @param url Git URL to clone (https:// or git@)
   * @param destPath Parent directory where the repo will be cloned into
   * @returns The path to the cloned repository
   */
  public static async cloneProject(
    url: string,
    destPath: string,
  ): Promise<string> {
    const repoName = basename(url, '.git').replace(/[^\w.-]/g, '_');
    const finalPath = join(destPath, repoName);

    if (pathExists(finalPath)) {
      throw new Error(`Destination '${repoName}' already exists`);
    }

    // Clone to a temp directory in destPath so rename works (same filesystem)
    await mkdir(destPath, { recursive: true });
    let tempDir: string | undefined;
    let tempClonePath!: string;

    try {
      tempDir = await mkdtemp(join(destPath, '.cyberismo-clone-'));
      tempClonePath = join(tempDir, repoName);
      const git = createGit({ timeout: gitTimeout() });
      await git.clone(url, tempClonePath);

      // Validate that the cloned repo contains Cyberismo projects
      const projects = await scanForProjects(tempClonePath);
      if (projects.length === 0) {
        throw new Error(
          'Cloned repository does not contain any Cyberismo projects',
        );
      }

      // Move to the final destination
      await rename(tempClonePath, finalPath);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to clone repository '${url}': ${error.message}`,
          { cause: error },
        );
      }
      throw error;
    } finally {
      // Clean up on failure. On success rename() has already moved tempClonePath
      // so rm with force:true is a no-op. Both paths are handled uniformly here.
      const cleanupPath = tempDir ?? tempClonePath;
      if (cleanupPath) {
        await rm(cleanupPath, { recursive: true, force: true }).catch((err) => {
          logger.warn(
            err,
            `Failed to clean up temporary path '${cleanupPath}'`,
          );
        });
      }
    }

    return finalPath;
  }

  /**
   * Creates a report
   * @param name name of the report
   */
  @write((name) => `Create report ${name}`)
  public async createReport(name: string) {
    return this.checkout.resources.byType(name, 'reports').createReport();
  }

  /**
   * Creates a skill
   * @param name name of the skill
   */
  @write((name) => `Create skill ${name}`)
  public async createSkill(name: string) {
    return this.checkout.resources.byType(name, 'skills').createSkill();
  }

  /**
   * Creates a new template to a project.
   * @param templateName Name of the template.
   * @param templateContent JSON content for the template file.
   */
  @write((templateName) => `Create template ${templateName}`)
  public async createTemplate(templateName: string, templateContent: string) {
    return this.checkout.resources
      .byType(templateName, 'templates')
      .create(templateContent ? JSON.parse(templateContent) : undefined);
  }

  /**
   * Creates a workflow.
   * @param workflowName workflow name
   * @param workflowContent workflow content JSON
   */
  @write((workflowName) => `Create workflow ${workflowName}`)
  public async createWorkflow(workflowName: string, workflowContent: string) {
    return this.checkout.resources
      .byType(workflowName, 'workflows')
      .create(workflowContent ? JSON.parse(workflowContent) : undefined);
  }
}
