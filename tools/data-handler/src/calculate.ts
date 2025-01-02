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
import { mkdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { Card } from './interfaces/project-interfaces.js';
import {
  copyDir,
  deleteDir,
  deleteFile,
  getFilesSync,
  pathExists,
  writeFileSafe,
} from './utils/file-utils.js';
import { Project, ResourcesFrom } from './containers/project.js';
import ClingoParser from './utils/clingo-parser.js';
import {
  BaseResult,
  ParseResult,
  QueryName,
  QueryResult,
} from './types/queries.js';
import { Mutex } from 'async-mutex';
import Handlebars from 'handlebars';
import { logger } from './utils/log-utils.js';
import {
  createCardFacts,
  createCardTypeFacts,
  createFieldTypeFacts,
  createLinkTypeFacts,
  createWorkflowFacts,
} from './utils/clingo-facts.js';
import { ClingoProgramBuilder } from './utils/clingo-program-builder.js';

// Class that calculates with logic program card / project level calculations.
export class Calculate {
  private static mutex = new Mutex();

  private logicBinaryName: string = 'clingo';
  private static importResourcesFileName: string = 'resourceImports.lp';
  private static importCardsFileName: string = 'cardTree.lp';
  private static modulesFileName: string = 'modules.lp';
  private static mainLogicFileName: string = 'main.lp';
  private static queryLanguageFileName: string = 'queryLanguage.lp';
  private static commonFolderLocation: string = join(
    fileURLToPath(import.meta.url),
    '../../../../calculations/common',
  );

  constructor(private project: Project) {}

  private static queryFolderLocation: string = join(
    fileURLToPath(import.meta.url),
    '../../../../calculations/queries',
  );

  private async generateCardTypes() {
    const cardTypes = await this.project.cardTypes();
    const promises = [];

    for (const cardType of await Promise.all(
      cardTypes.map((c) => this.project.cardType(c.name)),
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
      workflows.map((m) => this.project.workflow(m.name)),
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
      fieldTypes.map((m) => this.project.fieldType(m.name)),
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
      linkTypes.map((c) => this.project.linkType(c.name)),
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
  private async generateModules(parentCard: Card | undefined) {
    // When generating calculations for a specific module, do not generate common calculations.
    if (parentCard) {
      return;
    }
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
        const moduleLogicFile = resolve(
          join(calculationFile.path, basename(calculationFile.name)),
        );
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
  private async getCards(parentCard: Card | undefined): Promise<Card[]> {
    let cards: Card[] = [];
    if (parentCard) {
      const card = await this.project.findSpecificCard(parentCard, {
        metadata: true,
        children: true,
        content: false,
        parent: false,
      });
      if (card && card.children) {
        cards = Project.flattenCardArray(card.children);
      }
      if (card) {
        card.children = [];
        cards.unshift(card);
      }
    } else {
      cards = await this.project.cards();
    }
    return cards;
  }

  // Return path to query file if it exists, else return null.
  private async getQuery(queryName: string) {
    const location = join(Calculate.queryFolderLocation, `${queryName}.lp`);
    return pathExists(location) ? location : null;
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
        card = await this.project.findSpecificCard(cardKey);
        if (!card) {
          throw new Error(`Card '${cardKey}' not found`);
        }
      }

      const promiseContainer = [
        this.generateCommonFiles(),
        this.generateCardTreeContent(card).then(
          this.generateCardTree.bind(this),
        ),
        this.generateModules(card),
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
    const query = await this.getQuery(queryName);
    if (!query) {
      throw new Error(`Query file ${queryName} not found`);
    }

    // load file and
    let content = (await readFile(query)).toString();

    if (options && typeof options === 'object') {
      const handlebars = Handlebars.create();
      const compiled = handlebars.compile(content);
      content = compiled(options);
    }

    const result = await this.run({
      query: content,
    });

    if (result.error) {
      throw new Error(result.error);
    }
    return result.results as QueryResult<T>[];
  }

  /**
   * Runs a logic program.
   *
   * @param filePath Path to a query file to be run in relation to current working directory
   * @param timeout Specifies the time clingo is allowed to run
   * @returns parsed program output
   */
  public async run(
    data: {
      query?: string;
      file?: string;
    },
    timeout: number = 5000,
  ): Promise<ParseResult<BaseResult>> {
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

    const args = ['-', '--outf=0', '--out-ifs=\\n', '-V0', main, queryLanguage];
    if (data.file) {
      args.push(data.file);
    }

    return Calculate.mutex.runExclusive(async () => {
      const clingo = spawnSync(this.logicBinaryName, args, {
        encoding: 'utf8',
        input: data.query,
        timeout,
        maxBuffer: 1024 * 1024 * 100,
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
        return this.parseClingoResult(clingo.stdout);
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
        'Cannot find "Clingo". Please install "Clingo".\nIf using MacOs: "brew install clingo".\nIf using Windows: download sources and compile new version.\nIf using Linux: check if your distribution contains pre-built package. Otherwise download sources and compile.',
      );
    });
  }
}
