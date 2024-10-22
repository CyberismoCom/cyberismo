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
import { mkdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { Card, Link } from './interfaces/project-interfaces.js';
import {
  copyDir,
  deleteDir,
  deleteFile,
  getFilesSync,
  pathExists,
  writeFileSafe,
} from './utils/file-utils.js';
import { Project } from './containers/project.js';
import ClingoParser, { encodeClingoValue } from './utils/clingo-parser.js';
import {
  BaseResult,
  ParseResult,
  QueryName,
  QueryResult,
} from './types/queries.js';
import { Mutex } from 'async-mutex';

// Class that calculates with logic program card / project level calculations.
export class Calculate {
  static project: Project;
  private static mutex = new Mutex();

  private logicBinaryName: string = 'clingo';
  private static importFileName: string = 'imports.lp';
  private static modulesFileName: string = 'modules.lp';
  private static mainLogicFileName: string = 'main.lp';
  private static queryLanguageFileName: string = 'queryLanguage.lp';
  private static commonFolderLocation: string = join(
    fileURLToPath(import.meta.url),
    '../../../../calculations/common',
  );

  private static queryFolderLocation: string = join(
    fileURLToPath(import.meta.url),
    '../../../../calculations/queries',
  );

  // Return path to query file if it exists, else return null.
  private async getQuery(queryName: string) {
    const location = join(Calculate.queryFolderLocation, `${queryName}.lp`);
    return pathExists(location) ? location : null;
  }

  private async generateCardTypes() {
    const cardTypes = await Calculate.project.cardTypes();
    const promises = [];

    for (const cardType of await Promise.all(
      cardTypes.map((c) => Calculate.project.cardType(c.name)),
    )) {
      if (!cardType) continue;

      let content = '';

      content += `field("${cardType.name}", "workflow", "${cardType.workflow}").\n`;

      for (const customField of cardType.customFields || []) {
        content += `customField("${cardType.name}", "${encodeClingoValue(customField.name)}", "${encodeClingoValue(customField.displayName || '')}", "${customField.isEditable ? 'true' : 'false'}").\n`;
      }
      const cardTypeFile = join(
        Calculate.project.paths.calculationResourcesFolder,
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
    const workflows = await Calculate.project.workflows();
    const promises = [];
    // loop through workflows
    for (const workflow of await Promise.all(
      workflows.map((m) => Calculate.project.workflow(m.name)),
    )) {
      if (!workflow) continue;
      let content = '';

      // add states
      for (const state of workflow.states) {
        content += `workflowState("${workflow.name}", "${state.name}"`;
        if (state.category) {
          content += `, "${state.category}").`;
        } else {
          content += ').';
        }
        content += '\n';
      }

      // add transitions
      for (const transition of workflow.transitions) {
        for (const from of transition.fromState) {
          content += `workflowTransition("${workflow.name}", "${transition.name}", "${from}", "${transition.toState}").\n`;
        }
        if (transition.fromState.length === 0) {
          content += `workflowTransition("${workflow.name}", "${transition.name}", "", "${transition.toState}").\n`;
        }
      }

      const workFlowFile = join(
        Calculate.project.paths.calculationResourcesFolder,
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
    const destinationFileBase = Calculate.project.paths.calculationCardsFolder;
    const promiseContainer = [];
    if (!pathExists(destinationFileBase)) {
      await mkdir(destinationFileBase, { recursive: true });
    }

    // Small helper to deduce parent path
    function parentPath(cardPath: string) {
      const pathParts = cardPath.split(sep);
      if (pathParts.at(pathParts.length - 2) === 'cardRoot') {
        return '';
      } else {
        return pathParts.at(pathParts.length - 3);
      }
    }

    const cards = await this.getCards(parentCard);
    for (const card of cards) {
      let logicProgram = `\n% ${card.key}\n`;
      const parentsPath = parentPath(card.path);

      if (card.metadata) {
        for (const [field, value] of Object.entries(card.metadata)) {
          if (field === 'labels') {
            for (const label of value as Array<string>) {
              logicProgram += `label(${card.key}, "${encodeClingoValue(label)}").\n`;
            }
          } else if (field === 'links') {
            for (const link of value as Array<Link>) {
              logicProgram += `link(${card.key}, ${link.cardKey}, "${encodeClingoValue(link.linkType)}"${link.linkDescription != null ? `, "${encodeClingoValue(link.linkDescription)}"` : ''}).\n`;
            }
          } else {
            // Do not write null values
            if (value === null) {
              continue;
            }
            logicProgram += `field(${card.key}, "${encodeClingoValue(field)}", "${value !== undefined ? encodeClingoValue(value.toString()) : undefined}").\n`;
          }
        }
      }

      if (parentsPath !== undefined && parentsPath !== '') {
        logicProgram += `parent(${card.key}, ${parentsPath}).\n`;
      }

      // write card-specific logic program file
      const filename = join(destinationFileBase, card.key);
      const cardLogicFile = `${filename}.lp`;
      promiseContainer.push(writeFileSafe(cardLogicFile, logicProgram));
    }
    await Promise.all(promiseContainer);
  }

  // Once card specific files have been done, write the the imports
  private async generateImports() {
    const destinationFile = join(
      Calculate.project.paths.calculationFolder,
      Calculate.importFileName,
    );

    const folders = [
      Calculate.project.paths.calculationResourcesFolder,
      Calculate.project.paths.calculationCardsFolder,
    ];

    let importsContent: string = '';

    for (const folder of folders) {
      const files: string[] = getFilesSync(folder);

      // Helper to remove extension from filename.
      function removeExtension(file: string) {
        const index = file.lastIndexOf('.');
        return index === -1 ? file : file.substring(0, index);
      }

      importsContent += `% ${folder}\n`;
      for (const file of files) {
        importsContent += `#include "${resolve(join(folder, removeExtension(file) + '.lp')).replace(/\\/g, '/')}".\n`;
      }
      importsContent += '\n';
    }

    await writeFileSafe(destinationFile, importsContent);
  }

  // Write all common files which are not card specific.
  private async generateCommonFiles() {
    await copyDir(
      Calculate.commonFolderLocation,
      Calculate.project.paths.calculationFolder,
    );
  }

  // Collects all logic calculation files from project (local and imported modules)
  private async generateModules(parentCard: Card | undefined) {
    // When generating calculations for a specific module, do not generate common calculations.
    if (parentCard) {
      return;
    }
    const destinationFile = join(
      Calculate.project.paths.calculationFolder,
      Calculate.modulesFileName,
    );
    let modulesContent: string = '';
    // Collect all available calculations
    const calculations = await Calculate.project.calculations();

    // write the modules.lp
    for (const calculationFile of calculations) {
      if (calculationFile.path) {
        // modules resources are always prefixed with module name (to ensure uniqueness), remove module name
        const moduleLogicFile = resolve(
          join(calculationFile.path, basename(calculationFile.name)),
        );
        modulesContent += `#include "${moduleLogicFile.replace(/\\/g, '/')}".\n`;
      }
    }
    await writeFileSafe(destinationFile, modulesContent);
  }

  // Gets either all the cards (no parent), or a subtree.
  private async getCards(parentCard: Card | undefined): Promise<Card[]> {
    let cards: Card[] = [];
    if (parentCard) {
      const card = await Calculate.project.findSpecificCard(parentCard.key, {
        metadata: true,
        children: true,
        content: false,
        parent: false,
      });
      if (card && card.children) {
        cards = Project.flattenCardArray(card.children);
      }
      if (card) {
        delete card.children;
        cards.unshift(card);
      }
    } else {
      cards = await Calculate.project.cards();
    }
    return cards;
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
    const parser = new ClingoParser(Calculate.project);
    return parser.parseInput(actual_result);
  }

  // Creates a project, if it is not already created.
  private async setCalculateProject(card: Card) {
    if (!Calculate.project) {
      const path = await Project.findProjectRoot(card.path);
      if (path) {
        Calculate.project = new Project(path);
      } else {
        throw new Error(`Card '${card.key}' not in project structure`);
      }
    }
  }

  /**
   * Generates a logic program.
   * @param {string} projectPath Path to a project
   * @param {string} cardKey Optional, sub-card tree defining card
   */
  public async generate(projectPath: string, cardKey?: string) {
    Calculate.project = new Project(projectPath);

    await Calculate.mutex.runExclusive(async () => {
      // Cleanup old calculations before starting new ones.
      await deleteDir(Calculate.project.paths.calculationFolder);

      let card: Card | undefined;
      if (cardKey) {
        card = await Calculate.project.findSpecificCard(cardKey);
        if (!card) {
          throw new Error(`Card '${cardKey}' not found`);
        }
      }

      const promiseContainer = [
        this.generateCommonFiles(),
        this.generateCardTreeContent(card),
        this.generateModules(card),
        this.generateWorkFlows(),
        this.generateCardTypes(),
      ];

      await Promise.all(promiseContainer).then(this.generateImports.bind(this));
    });
  }

  /**
   * When card changes, update the card specific calculations.
   * @param {Card} changedCard Card that was changed.
   */
  public async handleCardChanged(changedCard: Card) {
    await this.setCalculateProject(changedCard); // can throw
    await this.generate(Calculate.project.basePath, changedCard.key);
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

    await this.setCalculateProject(deletedCard); // can throw
    const affectedCards = await this.getCards(deletedCard);
    const cardTreeFile = join(
      Calculate.project.paths.calculationFolder,
      Calculate.importFileName,
    );
    const calculationsForTreeExist =
      pathExists(cardTreeFile) &&
      pathExists(Calculate.project.paths.calculationFolder);

    let cardTreeContent = calculationsForTreeExist
      ? await readFile(cardTreeFile, 'utf-8')
      : '';
    for (const card of affectedCards) {
      // First, delete card specific files.
      const cardCalculationsFile = join(
        Calculate.project.paths.calculationCardsFolder,
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
  }

  /**
   * When new cards are added, automatically calculate card-specific values.
   * @param {Card[]} cards Added cards.
   */
  public async handleNewCards(cards: Card[]) {
    if (!cards) {
      return;
    }

    const firstCard = cards[0];
    await this.setCalculateProject(firstCard); // can throw
    const cardTreeFile = join(
      Calculate.project.paths.calculationFolder,
      Calculate.importFileName,
    );
    const calculationsForTreeExist =
      pathExists(cardTreeFile) &&
      pathExists(Calculate.project.paths.calculationFolder);
    if (!calculationsForTreeExist) {
      // No calculations done, ignore update.
      return;
    }

    // @todo - should only generate card-tree for created cards' common ancestor (or root)
    //         this might in some cases (sub-tree created) improve performance
    await this.generateCardTreeContent(undefined);
    await this.generateImports();
  }

  /**
   * Runs a pre-defined query.
   * @param projectPath Path to a project
   * @param queryName Name of the query file without extension
   * @returns parsed program output
   */
  public async runQuery<T extends QueryName>(
    projectPath: string,
    queryName: T,
  ): Promise<ParseResult<QueryResult<T>>> {
    const query = await this.getQuery(queryName);
    if (!query) {
      throw new Error(`Query file ${queryName} not found`);
    }
    // We assume named queries are correct and produce the specified result
    return this.run(projectPath, {
      file: query,
    }) as Promise<ParseResult<QueryResult<T>>>;
  }

  /**
   * Runs a logic program.
   *
   * @param projectPath Path to a project
   * @param filePath Path to a query file to be run in relation to current working directory
   * @param timeout Specifies the time clingo is allowed to run
   * @returns parsed program output
   */
  public async run(
    projectPath: string,
    data: {
      query?: string;
      file?: string;
    },
    timeout: number = 5000,
  ): Promise<ParseResult<BaseResult>> {
    Calculate.project = new Project(projectPath);
    const main = join(
      Calculate.project.paths.calculationFolder,
      Calculate.mainLogicFileName,
    );
    const queryLanguage = join(
      Calculate.project.paths.calculationFolder,
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
      // print the command
      console.log(`Ran command: ${this.logicBinaryName} ${args.join(' ')}`);

      if (clingo.stdout) {
        console.log(`Clingo output: \n${clingo.stdout}`);
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
