/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import {
  BaseResult,
  ParseResult,
  QueryName,
  QueryResult,
} from '../types/queries.js';
import { Card } from '../interfaces/project-interfaces.js';
import ClingoParser from '../utils/clingo-parser.js';
import { pathExists } from '../utils/file-utils.js';
import { Mutex } from 'async-mutex';
import Handlebars from 'handlebars';
import { Project, ResourcesFrom } from '../containers/project.js';
import { logger } from '../utils/log-utils.js';
import {
  createCardFacts,
  createCardTypeFacts,
  createFieldTypeFacts,
  createLinkTypeFacts,
  createWorkflowFacts,
} from '../utils/clingo-facts.js';
import { CardMetadataUpdater } from '../card-metadata-updater.js';
import { generateRandomString } from '../utils/random.js';
import {
  CardType,
  FieldType,
  LinkType,
  Workflow,
} from '../interfaces/resource-interfaces.js';
import { solve, setBaseProgram } from '@cyberismocom/node-clingo';

/**
 * This will done in a different way when build for npmjs is done
 */

const commonFolderLocation = join(
  fileURLToPath(import.meta.url),
  '../../../../../resources/calculations/common',
);

const baseProgramPath = join(commonFolderLocation, 'base.lp');
const queryLanguagePath = join(commonFolderLocation, 'queryLanguage.lp');

// Read base and query language files
const baseContent = readFileSync(baseProgramPath, 'utf-8');
const queryLanguageContent = readFileSync(queryLanguagePath, 'utf-8');

// Define names for the base programs
const BASE_PROGRAM_KEY = 'base';
const QUERY_LANGUAGE_KEY = 'queryLanguage';

// Class that calculates with logic program card / project level calculations.
export class Calculate {
  private static mutex = new Mutex();

  private pythonBinary: string = 'python';
  private queryCache = new Map<string, string>();
  private static commonFolderLocation: string = join(
    fileURLToPath(import.meta.url),
    '../../../../../resources/calculations/common',
  );
  constructor(private project: Project) {}

  // Storage for in-memory program content
  private logicProgram: string = '';
  private modules: string = '';

  private modulesInited = false;

  // Initialize modules during construction
  private async initializeModules() {
    try {
      // Collect all available calculations at initialization time
      const modules = await this.generateModules();
      this.modules = modules; // Store initial modules in logicProgram
    } catch (error) {
      logger.error(`Failed to initialize modules: ${error}`);
    }
  }

  //
  private static queryFolderLocation: string = join(
    fileURLToPath(import.meta.url),
    '../../../../../resources/calculations/queries',
  );

  // Wrapper to run onCreation query.
  private async creationQuery(cardKeys: string[]) {
    if (!cardKeys) return undefined;
    return this.runQuery('onCreation', {
      cardKeys,
    });
  }

  // Generate card tree content
  private async generateCardTreeContent(parentCard: Card | undefined) {
    const cards = await this.getCards(parentCard);

    let content = '% SECTION: CARDS_START\n';

    for (const card of cards) {
      const cardContent = await createCardFacts(card, this.project);
      content += `% SECTION: CARD_${card.key}_START\n% Card ${card.key}\n${cardContent}\n% SECTION: CARD_${card.key}_END\n\n`;
    }

    content += '% SECTION: CARDS_END';

    return content;
  }

  //
  private async generateCardTypes() {
    const cardTypes = await this.project.cardTypes();
    let content = '';

    for (const cardType of await Promise.all(
      cardTypes.map((c) => this.project.resource<CardType>(c.name)),
    )) {
      if (!cardType) continue;

      const cardTypeContent = createCardTypeFacts(cardType);
      content += `% CardType ${cardType.name}\n${cardTypeContent}\n\n`;
    }

    return content;
  }

  //
  private async generateFieldTypes() {
    const fieldTypes = await this.project.fieldTypes();
    let content = '';

    for (const fieldType of await Promise.all(
      fieldTypes.map((m) => this.project.resource<FieldType>(m.name)),
    )) {
      if (!fieldType) continue;

      const fieldTypeContent = createFieldTypeFacts(fieldType);
      content += `% FieldType ${fieldType.name}\n${fieldTypeContent}\n\n`;
    }

    return content;
  }

  // Collects all linkTypes from the project
  private async generateLinkTypes() {
    const linkTypes = await this.project.linkTypes();
    let content = '';

    for (const linkType of await Promise.all(
      linkTypes.map((c) => this.project.resource<LinkType>(c.name)),
    )) {
      if (!linkType) continue;

      const linkTypeContent = createLinkTypeFacts(linkType);
      content += `% LinkType ${linkType.name}\n${linkTypeContent}\n\n`;
    }

    return content;
  }

  // Collects all logic calculation files from project (local and imported modules)
  private async generateModules() {
    // Collect all available calculations
    const calculations = await this.project.calculations(ResourcesFrom.all);
    let content = '% SECTION: MODULES_START\n';

    // Process modules content
    for (const calculationFile of calculations) {
      if (calculationFile.path) {
        const moduleLogicFile = resolve(
          join(calculationFile.path, basename(calculationFile.name)),
        );

        const filePath = moduleLogicFile.endsWith('.lp')
          ? moduleLogicFile
          : moduleLogicFile + '.lp';

        if (pathExists(filePath)) {
          try {
            const moduleContent = await readFile(filePath, 'utf-8');
            content += `% SECTION: MODULE_${calculationFile.name}_START\n% Module ${calculationFile.name}\n${moduleContent}\n% SECTION: MODULE_${calculationFile.name}_END\n\n`;
          } catch (error) {
            logger.warn(
              `Failed to read module ${calculationFile.name}: ${error}`,
            );
          }
        }
      }
    }

    content += '% SECTION: MODULES_END';
    return content;
  }

  //
  private async generateWorkFlows() {
    const workflows = await this.project.workflows();
    let content = '';

    // loop through workflows
    for (const workflow of await Promise.all(
      workflows.map((m) => this.project.resource<Workflow>(m.name)),
    )) {
      if (!workflow) continue;

      const workflowContent = createWorkflowFacts(workflow);
      content += `% Workflow ${workflow.name}\n${workflowContent}\n\n`;
    }

    return content;
  }

  // Gets either all the cards (no parent), or a subtree.
  private async getCards(card: Card | undefined): Promise<Card[]> {
    let cards: Card[] = [];
    if (!card) {
      return this.project.cards();
    }
    if (card.children) {
      cards = Project.flattenCardArray(card.children);
    }
    card.children = [];
    cards.unshift(card);
    return cards;
  }

  // Returns query content from cache.
  // If the query is not yet used; reads it from disk and puts into cache.
  private async getQuery(queryName: string): Promise<string | undefined> {
    if (this.queryCache.has(queryName)) {
      return this.queryCache.get(queryName);
    }
    const query = await this.queryPath(queryName);
    if (!query) {
      throw new Error(`Query file ${queryName} not found`);
    }
    const content = (await readFile(query)).toString();
    this.queryCache.set(queryName, content);
    return content;
  }

  // Checks that Clingo successfully returned result.
  private async parseClingoResult(
    data: string[],
  ): Promise<ParseResult<BaseResult>> {
    const parser = new ClingoParser();
    return parser.parseInput(data.join('\n'));
  }

  // Return path to query file if it exists, else return null.
  private async queryPath(queryName: string) {
    const location = join(Calculate.queryFolderLocation, `${queryName}.lp`);
    return pathExists(location) ? location : null;
  }

  //
  private async run(
    data: {
      query?: string;
    },
    argMode: 'graph' | 'query' = 'query',
  ): Promise<string[]> {
    if (!data.query) {
      throw new Error('Must provide query to run a clingo program');
    }

    const res = await Calculate.mutex.runExclusive(async () => {
      // For queries, use both base and queryLanguage
      const basePrograms =
        argMode === 'query'
          ? [BASE_PROGRAM_KEY, QUERY_LANGUAGE_KEY]
          : BASE_PROGRAM_KEY;

      // Then solve with the program - need to pass the program as parameter
      return solve(data.query as string, basePrograms);
    });

    logger.trace(
      {
        query: data.query,
      },
      `Ran Clingo solve command`,
    );

    if (res && res.answers && res.answers.length > 0) {
      logger.trace({
        result: res.answers,
      });
      return res.answers;
    }

    throw new Error('Failed to run Clingo solve. No answers returned.');
  }

  /**
   * Generates a logic program.
   * @param cardKey Optional, sub-card tree defining card
   */
  public async generate(cardKey?: string) {
    await Calculate.mutex.runExclusive(async () => {
      if (!this.modulesInited) {
        await this.initializeModules();
        this.modulesInited = true;
      }

      let card: Card | undefined;
      if (cardKey) {
        card = await this.project.findSpecificCard(cardKey, {
          metadata: true,
          children: true,
          content: false,
          parent: false,
        });
        if (!card) {
          throw new Error(`Card '${cardKey}' not found`);
        }
      }
      const cardTreeContent = await this.generateCardTreeContent(card);
      const workFlows = await this.generateWorkFlows();
      const cardTypes = await this.generateCardTypes();
      const fieldTypes = await this.generateFieldTypes();
      const linkTypes = await this.generateLinkTypes();

      // Combine all resources
      const resourcesProgram =
        '% SECTION: RESOURCES_START\n' +
        workFlows +
        cardTypes +
        fieldTypes +
        linkTypes +
        '% SECTION: RESOURCES_END';

      // Create base program content
      const baseProgram =
        '% SECTION: BASE_START\n' +
        baseContent +
        '\n% SECTION: BASE_END\n\n' +
        this.modules +
        '\n\n' +
        cardTreeContent +
        '\n\n' +
        resourcesProgram +
        '\n\n';

      // Set the base programs separately
      setBaseProgram(baseProgram, BASE_PROGRAM_KEY);
      setBaseProgram(
        '% SECTION: QUERY_LANGUAGE_START\n' +
          queryLanguageContent +
          '\n% SECTION: QUERY_LANGUAGE_END',
        QUERY_LANGUAGE_KEY,
      );

      // Also store the base program (without query language) for updates
      this.logicProgram = baseProgram;
    });
  }

  /**
   * When card changes, update the card specific calculations.
   * @param changedCard Card that was changed.
   */
  public async handleCardChanged(changedCard: Card) {
    await this.generate(changedCard.key);
    return { statusCode: 200 };
  }

  /**
   * When cards are removed, automatically remove card-specific calculations.
   * @param deletedCard Card that is to be removed.
   */
  public async handleDeleteCard(deletedCard: Card) {
    if (!deletedCard) {
      return;
    }

    await Calculate.mutex.runExclusive(async () => {
      const affectedCards = await this.getCards(deletedCard);

      // Filter out deleted cards' content from the cardsProgram string
      for (const card of affectedCards) {
        // Remove card-specific content from the in-memory program using section markers
        const cardSectionPattern = new RegExp(
          `% SECTION: CARD_${card.key}_START[\\s\\S]*?% SECTION: CARD_${card.key}_END\\n\\n`,
          'g',
        );
        this.logicProgram = this.logicProgram.replace(cardSectionPattern, '');
      }

      // Update the base program after modifying logicProgram
      setBaseProgram(this.logicProgram, BASE_PROGRAM_KEY);
    });
  }

  /**
   * When new cards are added, automatically calculate card-specific values.
   * @param cards Added cards.
   */
  public async handleNewCards(cards: Card[]) {
    if (!cards) {
      return;
    }

    // Only proceed if we already have a logic program
    if (!this.logicProgram) {
      return;
    }

    await Calculate.mutex.runExclusive(async () => {
      // Generate content for all cards (including new ones)
      const cardTreeContent = await this.generateCardTreeContent(undefined);

      // Update the main logic program with the new cards program
      if (
        this.logicProgram.includes('% SECTION: CARDS_START') &&
        this.logicProgram.includes('% SECTION: CARDS_END')
      ) {
        this.logicProgram = this.logicProgram.replace(
          /% SECTION: CARDS_START[\s\S]*?% SECTION: CARDS_END/,
          cardTreeContent,
        );
      }

      // Update the base program after modifying logicProgram
      setBaseProgram(this.logicProgram, BASE_PROGRAM_KEY);
    });

    const cardKeys = cards.map((item) => item.key);
    const queryResult = await this.creationQuery(cardKeys);
    if (
      !queryResult ||
      queryResult.at(0) === undefined ||
      queryResult.at(0)?.updateFields === undefined
    ) {
      return;
    }

    const fieldsToUpdate = queryResult.at(0)!.updateFields;
    await CardMetadataUpdater.apply(this.project, fieldsToUpdate);
  }

  /**
   * Runs given logic program and creates a graph using clingraph
   * @param data Provide a query or/and a file which can be given to clingraph
   * @param timeout Maximum amount of milliseconds clingraph is allowed to run
   * @returns a base64 encoded image as a string
   */
  public async runGraph(
    data: { query?: string; file?: string },
    timeout?: number,
  ) {
    const clingoOutput = await this.run(data, 'graph');

    console.log(clingoOutput);

    // const firstLine = clingoOutput.split('\n')[0];

    // unlikely we ever get a collision
    const randomId = generateRandomString(36, 20);

    const clingGraphArgs = [
      '--out=render',
      '--format=png',
      '--type=digraph',
      `--name-format=${randomId}`,
      `--dir=${this.project.paths.tempFolder}`,
    ];

    // python is only used for windows
    const pythonArgs = [
      '-c',
      `from clingraph import main; import sys; sys.argv = ["sys.argv[0]", ${clingGraphArgs
        .map((arg) => `'${arg.replace(/\\/g, '\\\\')}'`)
        .join(',')}]; sys.exit(main())`,
    ];

    const clingraph = spawnSync(this.pythonBinary, pythonArgs, {
      encoding: 'utf8',
      input: clingoOutput.join('\n').replaceAll('\n', '. ') + '.',
      timeout,
      maxBuffer: 1024 * 1024 * 100,
    });

    if (clingraph.status !== 0) {
      throw new Error(`Graph: Failed to run clingraph ${clingraph.stderr}`);
    }

    const filePath = join(this.project.paths.tempFolder, randomId);

    let fileData;
    try {
      fileData = await readFile(filePath + '.png');
    } catch (e) {
      throw new Error(
        `Graph: Failed to read image file after generating graph: ${e}`,
      );
    } finally {
      if (pathExists(filePath)) await rm(filePath);
      if (pathExists(filePath + '.png')) await rm(filePath + '.png');
    }

    return fileData.toString('base64');
  }

  /**
   * Runs a logic program using clingo.
   * @param filePath Path to a query file to be run in relation to current working directory
   * @returns parsed program output
   */
  public async runLogicProgram(data: { query?: string; file?: string }) {
    const clingoOutput = await this.run(data);

    return this.parseClingoResult(clingoOutput);
  }

  /**
   * Runs a pre-defined query.
   * @param queryName Name of the query file without extension
   * @param options Any object that contains state for handlebars
   * @returns parsed program output
   */
  public async runQuery<T extends QueryName>(
    queryName: T,
    options?: unknown,
  ): Promise<QueryResult<T>[]> {
    let content = await this.getQuery(queryName);
    if (options && typeof options === 'object') {
      const handlebars = Handlebars.create();
      const compiled = handlebars.compile(content);
      content = compiled(options);
    }

    const clingoOutput = await this.run(
      {
        query: content,
      },
      'query',
    );

    const result = await this.parseClingoResult(clingoOutput);

    if (result.error) {
      throw new Error(result.error);
    }
    return result.results as QueryResult<T>[];
  }
}
