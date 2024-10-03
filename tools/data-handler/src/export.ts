/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import {
  appendFile,
  copyFile,
  mkdir,
  readdir,
  truncate,
} from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';

// ismo
import {
  Card,
  CardNameRegEx,
  CardType,
} from './interfaces/project-interfaces.js';
import { pathExists } from './utils/file-utils.js';
import { Project } from './containers/project.js';
import { readADocFileSync, readJsonFileSync } from './utils/json.js';

// asciidoctor
import Processor from '@asciidoctor/core';

import mime from 'mime-types';
import { sortItems } from './utils/lexorank.js';

const attachmentFolder: string = 'a';

export class Export {
  static project: Project;

  // Finds card based on name.
  private findCard(path: string, cards: Card[] | undefined) {
    return cards?.find((card) => card.key === basename(path));
  }

  // Finds owner of attachment (card) based on name.
  private findAttachmentOwner(path: string, cards: Card[] | undefined) {
    const parts = path.split(sep);
    const relatedCard = parts.at(parts.length - 2);
    return cards?.find((card) => card.key === relatedCard);
  }

  // Creates memory-based representation of <project>/cardRoot
  // todo: combine with function of same in Project
  protected async readCardTreeToMemory(
    cardRootPath: string,
    cards?: Card[],
    unknownFileIsAttachment: boolean = false,
  ) {
    let entries = await readdir(cardRootPath, { withFileTypes: true });
    entries = entries.filter((entry) => {
      return entry.name !== Project.schemaContentFile;
    });

    for (const entry of entries) {
      if (entry.isDirectory() && CardNameRegEx.test(entry.name)) {
        cards?.push({
          key: entry.name,
          path: entry.path,
          children: [],
        });
        await this.readCardTreeToMemory(join(entry.path, entry.name), cards);
      } else if (entry.isDirectory() && entry.name === 'c') {
        const found = this.findCard(entry.path, cards);
        if (found) {
          await this.readCardTreeToMemory(
            join(entry.path, entry.name),
            found.children,
          );
        } else {
          console.error(
            `Cannot find card folder '${join(entry.path, entry.name)}'`,
          );
        }
      } else if (entry.isDirectory() && entry.name === attachmentFolder) {
        unknownFileIsAttachment = true;
        await this.readCardTreeToMemory(
          join(entry.path, entry.name),
          cards,
          unknownFileIsAttachment,
        );
      } else if (entry.isFile() && entry.name === Project.cardMetadataFile) {
        const found = this.findCard(entry.path, cards);
        if (found) {
          found.metadata = readJsonFileSync(join(entry.path, entry.name));
        } else {
          console.error(`Cannot find file '${join(entry.path, entry.name)}'`);
        }
      } else if (entry.isFile() && entry.name === Project.cardContentFile) {
        const found = this.findCard(entry.path, cards);
        if (found) {
          found.content = readADocFileSync(join(entry.path, entry.name));
        } else {
          console.error(`Cannot find file '${join(entry.path, entry.name)}'`);
        }
      } else {
        if (unknownFileIsAttachment) {
          const found = this.findAttachmentOwner(entry.path, cards);
          if (found) {
            if (!found.attachments) {
              found.attachments = [];
            }
            found.attachments?.push({
              card: found.key,
              fileName: entry.name,
              path: entry.path,
              mimeType: mime.lookup(entry.name) || null,
            });
          } else {
            console.error(
              `Cannot find unknown file (likely attachment) ${join(entry.path, entry.name)}`,
            );
          }
        }
      }
    }
  }

  // This file should set the top level items to the adoc.
  private async toAdocFile(path: string, cards: Card[]) {
    await appendFile(path, `:imagesdir: ./${attachmentFolder}/\n`);
    await this.toAdocFileAsContent(path, cards);
  }

  // Format card metadata to an AsciiDoc table.
  protected metaToAdoc(card: Card, cardType: CardType | undefined): string {
    let content = '';
    if (card.metadata) {
      content += `[.cyberismo-meta-wrapper]\n`;
      content += '--\n';
      content += `[.cyberismo-meta]\n`;
      content += '[cols="1,1"]\n';
      content += '[frame=none]\n';
      content += '[grid=none]\n';
      content += '|===\n';
      content += '|Field |Value\n\n';
      content += `|Key|${card.key}\n`;

      for (const [key, value] of Object.entries(card.metadata)) {
        if (
          cardType?.alwaysVisibleFields?.includes(key) ||
          cardType?.optionallyVisibleFields?.includes(key)
        ) {
          const displayName = cardType?.customFields?.find(
            (item) => item.name === key,
          )?.displayName;
          let nameToShow = displayName
            ? displayName
            : key[0].toUpperCase() + key.slice(1);
          if (nameToShow === 'WorkflowState') {
            nameToShow = 'Workflow state';
          } else if (nameToShow === 'Cardtype') {
            nameToShow = 'Card type';
          }

          // Escape pipe character in cell values
          let escapedValue = 'N/A';

          if (value) {
            escapedValue = value.toString().replace(/\|/g, '\\|');
          }

          content += `|${nameToShow}|${escapedValue}\n`;
        }
      }
      content += '|===\n';
      content += '--\n';
    }
    return content;
  }

  private async toAdocFileAsContent(path: string, cards: Card[]) {
    for (const card of cards) {
      let fileContent = '';
      if (card.content) {
        const fullPath = resolve(
          process.cwd(),
          card.path,
          card.key,
          Project.cardContentFile,
        );
        if (card.metadata?.title) {
          fileContent += `\n== ${card.metadata?.title}\n`;
        }
        fileContent += `\ninclude::${fullPath}[]\n`;
      }

      if (card.metadata) {
        const cardTypeForCard = await Export.project.cardType(
          card.metadata?.cardType,
        );
        const metaDataContent = this.metaToAdoc(card, cardTypeForCard);
        fileContent += metaDataContent;
      }

      if (card.attachments) {
        const promiseContainer = [];
        for (const attachment of card.attachments) {
          const destination = join(
            dirname(path),
            attachmentFolder,
            attachment.fileName,
          );
          const source = join(attachment.path, attachment.fileName);
          promiseContainer.push(copyFile(source, destination));
        }
        await Promise.all(promiseContainer);
      }

      if (fileContent) {
        await appendFile(path, fileContent);
      }

      if (card.children) {
        await this.toAdocFileAsContent(path, card.children);
      }
    }
  }

  /**
   * Exports the card(s) to ascii doc.
   * @param source Cardroot path.
   * @param destination Path to where the resulting file(s) will be created.
   * @param cardKey If not exporting the whole card tree, card key of parent card.
   */
  public async exportToADoc(
    source: string,
    destination: string,
    cardKey?: string,
  ) {
    Export.project = new Project(source);
    const sourcePath: string = Export.project.cardRootFolder;
    let cards: Card[] = [];

    // If doing a partial tree export, put the parent information as it would have already been gathered.
    if (cardKey) {
      cards.push({
        key: cardKey,
        path: sourcePath,
      });
    }
    await this.readCardTreeToMemory(sourcePath, cards);

    // Sort the cards by rank
    cards = sortItems(cards, function (card) {
      return card.metadata?.rank || '1|z';
    });

    await mkdir(join(destination, attachmentFolder), { recursive: true });
    const resultDocumentPath: string = join(
      destination,
      Project.cardContentFile,
    );
    try {
      if (pathExists(resultDocumentPath)) {
        await truncate(resultDocumentPath, 0);
      }
      console.log(`Using existing output file '${resultDocumentPath}'`);
    } catch (error) {
      if (error instanceof Error) {
        console.log(`Creating output file '${resultDocumentPath}'`);
      }
    }

    await this.toAdocFile(resultDocumentPath, cards);
  }

  /**
   * Exports the card(s) to HTML and opens the browser.
   * @param source Cardroot path.
   * @param destination Path to where the resulting file(s) will be created.
   * @param cardKey Optional; If not exporting the whole card tree, card key of parent card.
   */
  public async exportToHTML(
    source: string,
    destination: string,
    cardKey?: string,
  ) {
    return this.exportToADoc(source, destination, cardKey).then(() => {
      const asciiDocProcessor = Processor();
      const adocFile = join(destination, Project.cardContentFile);
      asciiDocProcessor.convertFile(adocFile, {
        safe: 'safe',
        base_dir: '/',
        standalone: true,
      });
    });
  }
}
