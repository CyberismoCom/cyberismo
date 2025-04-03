/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import path, { basename, join, resolve } from 'node:path';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { Card } from '../interfaces/project-interfaces.js';
import {
  copyDir,
  deleteDir,
  deleteFile,
  getFilesSync,
  pathExists,
  writeFileSafe,
} from '../utils/file-utils.js';
import { Project, ResourcesFrom } from '../containers/project.js';
import ClingoParser from '../utils/clingo-parser.js';
import {
  BaseResult,
  ParseResult,
  QueryName,
  QueryResult,
} from '../types/queries.js';
import { Mutex } from 'async-mutex';
import Handlebars from 'handlebars';
import { logger } from '../utils/log-utils.js';
import {
  createCardFacts,
  createCardTypeFacts,
  createFieldTypeFacts,
  createLinkTypeFacts,
  createWorkflowFacts,
} from '../utils/clingo-facts.js';
import { CardMetadataUpdater } from '../card-metadata-updater.js';
import { ClingoProgramBuilder } from '../utils/clingo-program-builder.js';
import { generateRandomString } from '../utils/random.js';
import {
  CardType,
  FieldType,
  LinkType,
  Workflow,
} from '../interfaces/resource-interfaces.js';

// Class that calculates with logic program card / project level calculations.
export class Calculate {
  private static mutex = new Mutex();

  private logicBinaryName: string = 'clingo';
  private pythonBinary: string = 'python';
  private static importResourcesFileName: string = 'resourceImports.lp';
  private static importCardsFileName: string = 'cardTree.lp';
  private static modulesFileName: string = 'modules.lp';
  private static mainLogicFileName: string = 'main.lp';
  private static queryLanguageFileName: string = 'queryLanguage.lp';
  private queryCache = new Map<string, string>();
  private static commonFolderLocation: string = join(
    fileURLToPath(import.meta.url),
    '../../../../../resources/calculations/common',
  );

  constructor(private project: Project) {}

  private static queryFolderLocation: string = join(
    fileURLToPath(import.meta.url),
    '../../../../../resources/calculations/queries',
  );

  private async generateCardTypes() {
    const cardTypes = await this.project.cardTypes();
    const promises = [];

    for (const cardType of await Promise.all(
      cardTypes.map((c) => this.project.resource<CardType>(c.name)),
    )) {
      if (!cardType) continue;

      const content = createCardTypeFacts(cardType);

      const cardTypeFile = join(
        this.project.paths.calculationResourcesFolder,
        `${cardType.name}.lp`,
      );
      promises.push(
        writeFileSafe(cardTypeFile, content, {
          encoding: 'utf-8',
          flag: 'w',
        }),
      );
    }
    await Promise.all(promises);
  }

  private async generateWorkFlows() {
    const workflows = await this.project.workflows();
    const promises = [];
    // loop through workflows
    for (const workflow of await Promise.all(
      workflows.map((m) => this.project.resource<Workflow>(m.name)),
    )) {
      if (!workflow) continue;

      const content = createWorkflowFacts(workflow);

      const workFlowFile = join(
        this.project.paths.calculationResourcesFolder,
        `${workflow.name}.lp`,
      );

      promises.push(
        writeFileSafe(workFlowFile, content, {
          encoding: 'utf-8',
          flag: 'w',
        }),
      );
    }
    await Promise.all(promises);
  }
  // Write the cardTree.lp that contain data from the selected card-tree.
  private async generateCardTreeContent(parentCard: Card | undefined) {
    const destinationFileBase = this.project.paths.calculationCardsFolder;
    const promiseContainer = [];
    if (!pathExists(destinationFileBase)) {
      await mkdir(destinationFileBase, { recursive: true });
    }

    const cards = await this.getCards(parentCard);
    for (const card of cards) {
      const content = await createCardFacts(card, this.project);

      // write card-specific logic program file
      const filename = join(destinationFileBase, card.key);
      const cardLogicFile = `${filename}.lp`;
      promiseContainer.push(writeFileSafe(cardLogicFile, content));
    }
    await Promise.all(promiseContainer);
  }

  private async generateCardTree() {
    return this.generateImports(
      this.project.paths.calculationCardsFolder,
      join(this.project.paths.calculationFolder, Calculate.importCardsFileName),
    );
  }

  // Write all common files which are not card specific.
  private async generateCommonFiles() {
    await copyDir(
      Calculate.commonFolderLocation,
      this.project.paths.calculationFolder,
    );
  }

  private async generateFieldTypes() {
    const fieldTypes = await this.project.fieldTypes();
    const promises = [];

    for (const fieldType of await Promise.all(
      fieldTypes.map((m) => this.project.resource<FieldType>(m.name)),
    )) {
      if (!fieldType) continue;

      const content = createFieldTypeFacts(fieldType);

      const fieldTypeFile = join(
        this.project.paths.calculationResourcesFolder,
        `${fieldType.name}.lp`,
      );

      promises.push(
        writeFileSafe(fieldTypeFile, content, {
          encoding: 'utf-8',
          flag: 'w',
        }),
      );
    }
    await Promise.all(promises);
  }

  // Once card specific files have been done, write the the imports
  private async generateImports(folder: string, destinationFile: string) {
    if (!pathExists(folder)) {
      return;
    }
    const files: string[] = getFilesSync(folder);

    const builder = new ClingoProgramBuilder().addComment(folder);
    for (const file of files) {
      const parsedFile = path.parse(file);
      builder.addImport(
        resolve(join(folder, parsedFile.dir, parsedFile.name + '.lp')).replace(
          /\\/g,
          '/',
        ),
      );
    }
    await writeFileSafe(destinationFile, builder.buildAll());
  }
  // Collects all linkTypes from the project
  private async generateLinkTypes() {
    const linkTypes = await this.project.linkTypes();
    const promises = [];

    for (const linkType of await Promise.all(
      linkTypes.map((c) => this.project.resource<LinkType>(c.name)),
    )) {
      if (!linkType) continue;

      const linkTypeFile = join(
        this.project.paths.calculationResourcesFolder,
        `${linkType.name}.lp`,
      );

      const content = createLinkTypeFacts(linkType);

      promises.push(
        writeFileSafe(linkTypeFile, content, {
          encoding: 'utf-8',
          flag: 'w',
        }),
      );
    }
    await Promise.all(promises);
  }

  // Collects all logic calculation files from project (local and imported modules)
  private async generateModules() {
    const destinationFile = join(
      this.project.paths.calculationFolder,
      Calculate.modulesFileName,
    );
    // Collect all available calculations
    const calculations = await this.project.calculations(ResourcesFrom.all);

    const builder = new ClingoProgramBuilder();

    // write the modules.lp
    for (const calculationFile of calculations) {
      if (calculationFile.path) {
        // modules resources are always prefixed with module name (to ensure uniqueness), remove module name
        let moduleLogicFile = resolve(
          join(calculationFile.path, basename(calculationFile.name)),
        );
        if (!moduleLogicFile.endsWith('.lp')) {
          moduleLogicFile = moduleLogicFile + '.lp';
        }
        builder.addImport(moduleLogicFile.replace(/\\/g, '/'));
      }
    }
    await writeFileSafe(destinationFile, builder.buildAll());
  }
  private async generateResourceImports() {
    return this.generateImports(
      this.project.paths.calculationResourcesFolder,
      join(
        this.project.paths.calculationFolder,
        Calculate.importResourcesFileName,
      ),
    );
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

  // Return path to query file if it exists, else return null.
  private async queryPath(queryName: string) {
    const location = join(Calculate.queryFolderLocation, `${queryName}.lp`);
    return pathExists(location) ? location : null;
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
    data: string,
  ): Promise<ParseResult<BaseResult>> {
    const actual_result = data.substring(0, data.indexOf('SATISFIABLE'));
    if (actual_result.length === 0 || !actual_result) {
      return {
        results: [],
        error: null,
      };
    }
    const parser = new ClingoParser();
    return parser.parseInput(actual_result);
  }

  /**
   * Generates a logic program.
   * @param {string} cardKey Optional, sub-card tree defining card
   */
  public async generate(cardKey?: string) {
    await Calculate.mutex.runExclusive(async () => {
      // Cleanup old calculations before starting new ones.
      await deleteDir(this.project.paths.calculationFolder);

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

      const promiseContainer = [
        this.generateCommonFiles(),
        this.generateCardTreeContent(card).then(
          this.generateCardTree.bind(this),
        ),
        this.generateModules(),
        this.generateWorkFlows(),
        this.generateCardTypes(),
        this.generateFieldTypes(),
        this.generateLinkTypes(),
      ];

      await Promise.all(promiseContainer).then(
        this.generateResourceImports.bind(this),
      );
    });
  }

  /**
   * When card changes, update the card specific calculations.
   * @param {Card} changedCard Card that was changed.
   */
  public async handleCardChanged(changedCard: Card) {
    await this.generate(changedCard.key);
    return { statusCode: 200 };
  }

  /**
   * When cards are removed, automatically remove card-specific calculations.
   * @param {Card} deletedCard Card that is to be removed.
   */
  public async handleDeleteCard(deletedCard: Card) {
    if (!deletedCard) {
      return;
    }

    await Calculate.mutex.runExclusive(async () => {
      const affectedCards = await this.getCards(deletedCard);
      const cardTreeFile = join(
        this.project.paths.calculationFolder,
        Calculate.importCardsFileName,
      );
      const calculationsForTreeExist =
        pathExists(cardTreeFile) &&
        pathExists(this.project.paths.calculationFolder);

      let cardTreeContent = calculationsForTreeExist
        ? await readFile(cardTreeFile, 'utf-8')
        : '';
      for (const card of affectedCards) {
        // First, delete card specific files.
        const cardCalculationsFile = join(
          this.project.paths.calculationCardsFolder,
          `${card.key}.lp`,
        );
        if (pathExists(cardCalculationsFile)) {
          await deleteFile(cardCalculationsFile);
        }
        // Then, delete rows from cardTree.lp.
        const removeRow = `#include "cards/${card.key}.lp".\n`.replace(
          /\\/g,
          '/',
        );
        cardTreeContent = cardTreeContent.replace(removeRow, '');
      }
      if (calculationsForTreeExist) {
        await writeFileSafe(cardTreeFile, cardTreeContent);
      }
    });
  }

  // Wrapper to run onCreation query.
  private async creationQuery(cardKeys: string[]) {
    if (!cardKeys) return undefined;
    return this.runQuery('onCreation', {
      cardKeys,
    });
  }
  /**
   * When new cards are added, automatically calculate card-specific values.
   * @param {Card[]} cards Added cards.
   */
  public async handleNewCards(cards: Card[]) {
    if (!cards) {
      return;
    }

    const cardTreeFile = join(
      this.project.paths.calculationFolder,
      Calculate.importCardsFileName,
    );
    const calculationsForTreeExist =
      pathExists(cardTreeFile) &&
      pathExists(this.project.paths.calculationFolder);
    if (!calculationsForTreeExist) {
      // No calculations done, ignore update.
      return;
    }

    await Calculate.mutex.runExclusive(async () => {
      // @todo - should only generate card-tree for created cards' common ancestor (or root)
      //         this might in some cases (sub-tree created) improve performance
      await this.generateCardTreeContent(undefined);
      await this.generateCardTree();
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

    const clingoOutput = await this.run({
      query: content,
    });

    const result = await this.parseClingoResult(clingoOutput);

    if (result.error) {
      throw new Error(result.error);
    }
    return result.results as QueryResult<T>[];
  }
  /**
   * Runs a logic program using clingo.
   *
   * @param filePath Path to a query file to be run in relation to current working directory
   * @param timeout Specifies the time clingo is allowed to run
   * @returns parsed program output
   */
  public async runLogicProgram(data: { query?: string; file?: string }) {
    const clingoOutput = await this.run(data);

    return this.parseClingoResult(clingoOutput);
  }

  private async run(
    data: {
      query?: string;
      file?: string;
    },
    argMode: 'graph' | 'query' = 'query',
    timeout: number = 5000,
  ): Promise<string> {
    const main = join(
      this.project.paths.calculationFolder,
      Calculate.mainLogicFileName,
    );
    const queryLanguage = join(
      this.project.paths.calculationFolder,
      Calculate.queryLanguageFileName,
    );

    if (!data.file && !data.query) {
      throw new Error(
        'Must provide either query or file to run a clingo program',
      );
    }

    const args = ['-', '--outf=0', '-V0', '--warn=none'];

    if (argMode === 'graph') {
      args.push('--out-atomf=%s.');
    } else {
      args.push('--out-ifs=\\n');
      args.push(queryLanguage);
    }
    args.push(main);

    if (data.file) {
      args.push(data.file);
    }
    const clingo = await Calculate.mutex.runExclusive(async () => {
      return spawnSync(this.logicBinaryName, args, {
        encoding: 'utf8',
        input: data.query,
        timeout,
        maxBuffer: 1024 * 1024 * 100,
      });
    });
    logger.trace(
      {
        args,
        query: data.query,
      },
      `Ran command`,
    );

    if (clingo.stdout) {
      logger.trace({
        stdout: clingo.stdout,
        stderr: clingo.stderr,
      });
      return clingo.stdout;
    }

    if (clingo.stderr && clingo.status) {
      const code = clingo.status;
      // clingo's exit codes are bitfields. todo: move these somewhere
      const clingo_process_exit = {
        E_UNKNOWN: 0,
        E_INTERRUPT: 1,
        E_SAT: 10,
        E_EXHAUST: 20,
        E_MEMORY: 33,
        E_ERROR: 65,
        E_NO_RUN: 128,
      };
      // "satisfied" && "exhaust" mean that everything was inspected and a solution was found.
      if (
        !(
          code & clingo_process_exit.E_SAT &&
          code & clingo_process_exit.E_EXHAUST
        )
      ) {
        if (code & clingo_process_exit.E_ERROR) {
          console.error('Error');
        }
        if (code & clingo_process_exit.E_INTERRUPT) {
          console.error('Interrupted');
        }
        if (code & clingo_process_exit.E_MEMORY) {
          console.error('Out of memory');
        }
        if (code & clingo_process_exit.E_NO_RUN) {
          console.error('Not run');
        }
        if (code & clingo_process_exit.E_UNKNOWN) {
          console.error('Unknown error');
        }
      }
      throw new Error(clingo.stderr);
    }
    throw new Error(
      'Cannot find "Clingo". Please check "Clingo" installation. See installation instructions at https://docs.cyberismo.com/cards/docs_17.html',
    );
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

    const firstLine = clingoOutput.split('\n')[0];

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
      input: firstLine,
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
}
