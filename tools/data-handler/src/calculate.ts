/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { basename, join, sep } from 'node:path';
import { Dirent } from 'node:fs';
import { mkdir, opendir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// ismo
import { card, link } from './interfaces/project-interfaces.js';
import { copyDir, deleteFile, pathExists } from './utils/file-utils.js';
import { Project } from './containers/project.js';
import { fileURLToPath } from 'node:url';
import ClingoParser, { ParseResult } from './utils/clingo-parser.js';

// Class that calculates with logic program card / project level calculations.
export class Calculate {
  static project: Project;

  private logicBinaryName: string = 'clingo';
  private static cardTreeFileName: string = 'cardTree.lp';
  private static modulesFileName: string = 'modules.lp';
  private static mainLogicFileName: string = 'main.lp';
  private static queryLanguageFileName: string = 'queryLanguage.lp';
  private static commonFolderLocation: string = join(
    fileURLToPath(import.meta.url),
    '../../../../calculations/common',
  );

  constructor() {
    // todo: set reusable paths here - problem is that project's path should be set
  }
  // Write the cardtree.lp that contain data from the selected card-tree.
  private async generateCardTreeContent(parentCard: card | undefined) {
    const destinationFileBase = join(
      Calculate.project.calculationFolder,
      'cards',
    );
    const promiseContainer = [];

    // Small helper to deduce parent path
    function parentPath(cardPath: string) {
      const pathParts = cardPath.split(sep);
      if (pathParts.at(pathParts.length - 2) === 'cardroot') {
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
              logicProgram += `label(${card.key}, "${label}").\n`;
            }
          } else if (field === 'links') {
            for (const link of value as Array<link>) {
              logicProgram += `link(${card.key}, ${link.cardKey}, "${link.linkType}"${link.linkDescription != null ? `, "${link.linkDescription}"` : ''}).\n`;
            }
          } else {
            // Do not write null values
            if (value === null) {
              continue;
            }
            logicProgram += `field(${card.key}, "${field}", "${value}").\n`;
          }
        }
      }

      if (parentsPath !== undefined && parentsPath !== '') {
        logicProgram += `parent(${card.key}, ${parentsPath}).\n`;
      }

      // write card-specific logic program file
      const filename = join(destinationFileBase, card.key);
      const cardLogicFile = `${filename}.lp`;
      promiseContainer.push(writeFile(cardLogicFile, logicProgram));
    }
    await Promise.all(promiseContainer);
  }

  // Once card specific files have been done, write the cardtree.lp.
  private async genereteCardTree() {
    const destinationFile = join(
      Calculate.project.calculationFolder,
      Calculate.cardTreeFileName,
    );
    const destinationFileBase = join(
      Calculate.project.calculationFolder,
      'cards',
    );

    // Helper to remove extension from filename.
    function removeExtension(dirent: Dirent) {
      const name = dirent.name;
      const index = name.lastIndexOf('.');
      return index === -1 ? name : name.substring(0, index);
    }

    const files = await opendir(destinationFileBase);
    let cardTreeContent: string = '';
    for await (const file of files) {
      cardTreeContent += `#include "cards/${removeExtension(file)}.lp".\n`;
    }
    await writeFile(destinationFile, cardTreeContent);
  }

  // Write all common files which are not card specific.
  private async generateCommonFiles() {
    await copyDir(
      Calculate.commonFolderLocation,
      Calculate.project.calculationFolder,
    );
  }

  // Collects all logic calculation files from project (local and imported modules)
  private async generateModules(parentCard: card | undefined) {
    // When generating calculations for a specific module, do not generate common calculations.
    if (parentCard) {
      return;
    }
    const destinationFile = join(
      Calculate.project.calculationFolder,
      Calculate.modulesFileName,
    );
    let modulesContent: string = '';
    const calculations = await Calculate.project.calculations();

    // write the modules.lp
    for (const calculationFile of calculations) {
      if (calculationFile.path) {
        // modules resources are always prefixed with module name (to ensure uniqueness), remove module name
        const moduleLogicFile = join(
          calculationFile.path,
          basename(calculationFile.name),
        );
        modulesContent += `#include "${moduleLogicFile}".\n`;
      }
    }
    await writeFile(destinationFile, modulesContent);
  }

  // Gets either all the cards (no parent), or a subtree.
  private async getCards(parentCard: card | undefined): Promise<card[]> {
    let cards: card[] = [];
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
  private parseClingoResult(data: string) {
    const actual_result = data.substring(0, data.indexOf('SATISFIABLE'));
    if (actual_result.length === 0 || !actual_result) {
      return;
    }
    const parser = new ClingoParser(Calculate.project);
    return parser.parseInput(actual_result);
  }

  // Creates a project, if it is not already created.
  private async setCalculateProject(card: card) {
    if (!Calculate.project) {
      const path = await Project.findProjectRoot(card.path);
      if (path) {
        Calculate.project = new Project(path);
      } else {
        throw `Card '${card.key}' not in project structure`;
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

    let card: card | undefined;
    if (cardKey) {
      card = await Calculate.project.findSpecificCard(cardKey);
      if (!card) {
        throw new Error(`Card '${cardKey}' not found`);
      }
    }

    await mkdir(join(Calculate.project.calculationFolder, 'cards'), {
      recursive: true,
    });

    const promiseContainer = [
      this.generateCommonFiles(),
      this.generateCardTreeContent(card),
      this.generateModules(card),
    ];

    await Promise.all(promiseContainer);

    // Card tree must be generated after all card specific files have been created,
    // because it reads all card files
    await this.genereteCardTree();
  }

  /**
   * When card changes, update the card specific calculations.
   * @param {card} changedCard Card that was changed.
   */
  public async handleCardChanged(changedCard: card) {
    await this.setCalculateProject(changedCard); // can throw
    await this.generate(Calculate.project.basePath, changedCard.key);
    return { statusCode: 200 };
  }

  /**
   * When cards are removed, automatically remove card-specific calculations.
   * @param {card} deletedCard Card that is to be removed.
   */
  public async handleDeleteCard(deletedCard: card) {
    if (!deletedCard) {
      return;
    }

    await this.setCalculateProject(deletedCard); // can throw
    const affectedCards = await this.getCards(deletedCard);
    const cardTreeFile = join(
      Calculate.project.calculationFolder,
      Calculate.cardTreeFileName,
    );
    const calculationsForTreeExist =
      pathExists(cardTreeFile) &&
      pathExists(Calculate.project.calculationFolder);

    let cardTreeContent = calculationsForTreeExist
      ? await readFile(cardTreeFile, 'utf-8')
      : '';
    for (const card of affectedCards) {
      // First, delete card specific files.
      const cardCalculationsFile = join(
        Calculate.project.calculationFolder,
        'cards',
        `${card.key}.lp`,
      );
      if (pathExists(cardCalculationsFile)) {
        await deleteFile(cardCalculationsFile);
      }
      // Then, delete rows from cardtree.lp.
      const removeRow = `#include "cards/${card.key}.lp".\n`;
      cardTreeContent = cardTreeContent.replace(removeRow, '');
    }
    if (calculationsForTreeExist) {
      await writeFile(cardTreeFile, cardTreeContent);
    }
  }

  /**
   * When new cards are added, automatically calculate card-specific values.
   * @param {card[]} cards Added cards.
   */
  public async handleNewCards(cards: card[]) {
    if (!cards) {
      return;
    }

    const firstCard = cards[0];
    await this.setCalculateProject(firstCard); // can throw
    const cardTreeFile = join(
      Calculate.project.calculationFolder,
      Calculate.cardTreeFileName,
    );
    const calculationsForTreeExist =
      pathExists(cardTreeFile) &&
      pathExists(Calculate.project.calculationFolder);
    if (!calculationsForTreeExist) {
      // No calculations done, ignore update.
      return;
    }

    // @todo - should only generate card-tree for created cards' common ancestor (or root)
    //         this might in some cases (sub-tree created) improve performance
    await this.generateCardTreeContent(undefined);
    await this.genereteCardTree();
  }

  /**
   * Runs a logic program.
   *
   * @param projectPath Path to a project
   * @param filePath Path to a query file to be run in relation to current working directory
   * @returns parsed program output
   */
  public async run(
    projectPath: string,
    filePath: string,
  ): Promise<ParseResult | undefined> {
    Calculate.project = new Project(projectPath);
    const main = join(
      Calculate.project.calculationFolder,
      Calculate.mainLogicFileName,
    );
    const queryLanguage = join(
      Calculate.project.calculationFolder,
      Calculate.queryLanguageFileName,
    );

    const args = [
      '-',
      '--outf=0',
      '--out-ifs=\\n',
      '-V0',
      main,
      queryLanguage,
      filePath,
    ];
    const clingo = spawnSync(this.logicBinaryName, args, {
      encoding: 'utf8',
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
      throw new Error('Clingo error');
    }
    throw new Error(
      'Cannot find "Clingo". Please install "Clingo".\nIf using MacOs: "brew install clingo".\nIf using Windows: download sources and compile new version.\nIf using Linux: check if your distribution contains pre-built package. Otherwise download sources and compile.',
    );
  }
}
