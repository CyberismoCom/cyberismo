/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import fs from 'node:fs';
import os from 'node:os';
import { appendFile, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import git from 'isomorphic-git';
import { dump } from 'js-yaml';

import { Card } from './interfaces/project-interfaces.js';
import { errorFunction } from './utils/log-utils.js';
import { Export } from './export.js';
import { Project } from './containers/project.js';
import { sortItems } from './utils/lexorank.js';
import { Calculate } from './calculate.js';
import { Show } from './show.js';

interface ExportOptions {
  silent: boolean;
}

export class ExportSite extends Export {
  private tmpDir: string = '';
  private moduleDir: string = '';
  private pagesDir: string = '';
  private imagesDir: string = '';
  private playbookDir: string = '';
  private playbookFile: string = '';
  private navFile: string = '';
  private options: ExportOptions | undefined;

  constructor(project: Project, calculateCmd: Calculate, showCmd: Show) {
    super(project, calculateCmd, showCmd);
  }

  // todo: change this so that split temp folder creation to its own method.
  // then parallelize this and export() as much as you can.
  private async initDirectories() {
    // Create temporary adoc output directory
    try {
      this.tmpDir = mkdtempSync(join(tmpdir(), 'cards-'));
    } catch (error) {
      throw new Error(errorFunction(error));
    }

    // Antora requires the content directory to be a Git repository
    await this.initRepo();

    // Create the pages and images directories
    this.moduleDir = join(this.tmpDir, 'modules', 'ROOT');
    this.pagesDir = join(this.moduleDir, 'pages');
    this.imagesDir = join(this.moduleDir, 'assets', 'images');
    this.navFile = join(this.moduleDir, 'nav.adoc');

    const promiseContainer: Promise<string | undefined>[] = [];
    promiseContainer.push(mkdir(this.pagesDir, { recursive: true }));
    promiseContainer.push(mkdir(this.imagesDir, { recursive: true }));
    await Promise.all(promiseContainer);

    // Create the playbook directory
    this.playbookDir = mkdtempSync(join(tmpdir(), 'cards-playbook-'));
  }

  // Generate the site from the source files using Antora.
  private generate(outputPath: string) {
    const additionalArguments = ['--to-dir', outputPath, this.playbookFile];
    if (this.options && this.options?.silent) {
      additionalArguments.unshift('--silent');
    }
    // Use spawnsync to npx execute the program "antora"
    try {
      // Allthough we use pnpm as the package manager, we rather use npx at runtime, because it is shipped with node
      spawnSync('npx', ['antora', ...additionalArguments], {
        stdio: 'inherit',
        shell: os.platform() === 'win32',
      });
    } catch (error) {
      throw new Error(errorFunction(error));
    }
  }

  // Create the Antora playbook.
  private createPlaybook(cards: Card[]) {
    let startPage: string = '';

    if (cards[0]) {
      startPage = cards[0].key + '.adoc';
    } else {
      throw new Error('Cannot create a playbook for an empty card set');
    }

    const playbook = {
      site: {
        title: this.project.configuration.name,
        start_page: `cards:ROOT:${startPage}`,
      },
      content: {
        sources: [
          {
            url: this.tmpDir,
            branches: 'HEAD',
          },
        ],
      },
      urls: {
        html_extension_style: 'default',
      },
      ui: {
        bundle: {
          url: join(
            dirname(fileURLToPath(import.meta.url)),
            '..',
            '..',
            '..',
            'resources/ui-bundle',
          ),
          snapshot: true,
        },
      },
    };

    this.playbookFile = join(this.playbookDir, 'antora-playbook.yml');
    fs.writeFileSync(this.playbookFile, dump(playbook));
  }

  // Create the Antora site descriptor.
  private createDescriptor() {
    const projectName = this.project.configuration.name;
    const descriptor = {
      name: 'cards',
      title: projectName,
      version: null,
      nav: ['modules/ROOT/nav.adoc'],
    };

    const descriptorPath = join(this.tmpDir, 'antora.yml');
    try {
      writeFileSync(descriptorPath, dump(descriptor));
    } catch (error) {
      throw new Error(errorFunction(error));
    }
  }

  // Initialise the temporary directory as a temporary Git repository.
  private async initRepo() {
    try {
      await git.init({ fs, dir: this.tmpDir });
      writeFileSync(join(this.tmpDir, '.gitkeep'), '');
      await git.add({ fs, dir: this.tmpDir, filepath: '.gitkeep' });
    } catch (error) {
      throw new Error(errorFunction(error));
    }

    try {
      await git.commit({
        fs,
        dir: this.tmpDir,
        author: {
          name: 'Cyberismo Cards',
          email: 'info@cyberismo.com',
        },
        message: 'Add .gitkeep',
      });
    } catch (error) {
      throw new Error(errorFunction(error));
    }
  }

  // Write cards as Antora-compatible AsciiDoc to the given location
  // @param path Directory where the cards should be written
  // @param cards Array of Cards
  // @param depth Navigation depth - this is used in recursion to format the hierarchical menu
  private async toAdocDirectoryAsContent(
    path: string,
    cards: Card[],
    depth: number,
  ) {
    depth++;

    // Sort the cards by rank
    cards = sortItems(cards, function (card) {
      return card.metadata?.rank || '1|z';
    });

    // Ensure the target path exists
    await mkdir(path, { recursive: true });
    for (const card of cards) {
      // Construct path for individual card file
      const cardPath = join(path, card.key + '.adoc');
      const cardXRef = cardPath.slice(this.pagesDir.length);
      let navFileContent = '';
      if (card.metadata?.progress) {
        navFileContent =
          '*'.repeat(depth) +
          ` xref:${cardXRef}[${card.metadata?.title} (${card.metadata?.progress}%)]\n`;
      } else {
        navFileContent =
          '*'.repeat(depth) + ` xref:${cardXRef}[${card.metadata?.title}]\n`;
      }

      await appendFile(this.navFile, navFileContent);

      let tempContent: string = '';
      if (card.metadata) {
        const cardTypeForCard = await this.project.cardType(
          card.metadata?.cardType,
        );
        tempContent = '\n= ';
        tempContent += card.metadata?.title
          ? `${card.metadata.title}\n\n`
          : 'Untitled\n\n';
        tempContent += super.metaToAdoc(card, cardTypeForCard);
      }

      if (card.content) {
        tempContent += '\n' + card.content;
      }
      if (tempContent !== undefined) {
        await writeFile(cardPath, tempContent);
      }

      if (card.children) {
        // Recurse into the child cards
        await this.toAdocDirectoryAsContent(path, card.children, depth);
      }

      if (card.attachments) {
        const promiseContainer = [];
        for (const attachment of card.attachments) {
          const source = join(attachment.path, attachment.fileName);
          const destination = join(this.imagesDir, `${attachment.fileName}`);
          promiseContainer.push(copyFile(source, destination));
        }
        await Promise.all(promiseContainer);
      }
    }

    --depth;
  }

  // Export the cards to the temporary directory as a full HTML site generated by Antora.
  private async export(destination: string, cards: Card[]) {
    await this.initDirectories();
    this.createDescriptor();
    await this.toAdocDirectoryAsContent(this.pagesDir, cards, 0);
    this.createPlaybook(cards);
    this.generate(destination);
  }

  /**
   * Export the card tree as an Antora site
   * @param destination Path where the site is generated
   * @param cardKey Optional; If defined exports the card tree from underneath this card.
   */
  public async exportToSite(
    destination: string,
    cardKey?: string,
    options?: ExportOptions,
  ): Promise<string> {
    this.options = options;
    const sourcePath: string = cardKey
      ? join(
          this.project.paths.cardRootFolder,
          this.project.pathToCard(cardKey),
        )
      : this.project.paths.cardRootFolder;
    const cards: Card[] = [];

    // If doing a partial tree export, put the parent information as it would have already been gathered.
    if (cardKey) {
      const card = await this.project.findSpecificCard(cardKey);
      if (!card) {
        throw new Error(
          `Input validation error: cannot find card '${cardKey}'`,
        );
      }
      cards.push({
        key: cardKey,
        path: sourcePath,
        children: [],
        attachments: [],
      });
    }

    await this.calculateCmd.generate();
    const tree = await this.calculateCmd.runQuery('tree');
    for (const treeQueryResult of tree) {
      cards.push(await this.treeQueryResultToCard(treeQueryResult));
    }

    if (!cards.length) {
      throw new Error('No cards found');
    }
    if (cards.length > 3000) {
      throw new Error(
        `There are ${cards.length} cards in the project. Exporting to a site only supports maximum of 3000 cards.`,
      );
    }
    if (cards.length > 1000 && cards.length < 3000) {
      console.warn(
        `Warning: There are ${cards.length} cards in the project. There is a hard limit of 3000 cards that can be exported as a site.`,
      );
    }

    await this.export(destination, cards);
    return '';
  }
}
