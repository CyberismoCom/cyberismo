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
import { readdir, readFile, writeFile } from 'node:fs/promises';

import { writeJsonFile } from '../utils/json.js';
import { getFilesSync, pathExists } from '../utils/file-utils.js';

// interfaces
import {
  CardAttachment,
  Card,
  CardNameRegEx,
  FetchCardDetails,
} from '../interfaces/project-interfaces.js';

// asciidoctor
import asciidoctor from '@asciidoctor/core';

import mime from 'mime-types';

/**
 * Card container base class. Used for both Project and Template.
 * Contains common card-related functionality.
 */
export class CardContainer {
  public basePath: string;
  protected containerName: string;

  static projectConfigFileName = 'cardsConfig.json';
  static cardMetadataFile = 'index.json';
  static cardContentFile = 'index.adoc';
  static schemaContentFile = '.schema';

  constructor(path: string, name: string) {
    this.basePath = path;
    this.containerName = name;
  }

  // Lists all direct children.
  private async childrenCards(cardPath: string, details?: FetchCardDetails) {
    const containerCards: Card[] = [];
    await this.doCollectCards(cardPath, containerCards, details, true);
    return containerCards;
  }

  // Function collects attachments from all cards in one folder.
  private async doCollectAttachments(
    folder: string,
    attachments: CardAttachment[],
  ): Promise<CardAttachment[]> {
    const currentPaths: string[] = [];
    if (pathExists(folder)) {
      const entries = (await readdir(folder, { withFileTypes: true })).filter(
        (item) => item.isDirectory(),
      );
      for (const entry of entries) {
        // Investigate the content of card folders' attachment folders, but do not continue to children cards.
        // For each attachment folder, collect all files.
        if (CardNameRegEx.test(entry.name)) {
          currentPaths.push(join(entry.parentPath, entry.name));
        } else if (entry.name === 'c') {
          continue;
        } else if (entry.name === 'a') {
          const attachmentFolder = join(entry.parentPath, entry.name);
          const cardItem = basename(entry.parentPath) || '';
          const entryAttachments = await readdir(attachmentFolder, {
            withFileTypes: true,
          });
          entryAttachments.forEach((attachment) =>
            attachments.push({
              card: cardItem,
              fileName: attachment.name,
              path: attachment.parentPath,
              mimeType: mime.lookup(attachment.name) || null,
            }),
          );
        }
      }
    }
    if (currentPaths) {
      const promises = currentPaths.map((item) =>
        this.doCollectAttachments(item, attachments),
      );
      await Promise.all(promises);
    }
    return attachments;
  }

  // Collects all cards from container.
  private async doCollectCards(
    path: string,
    cards: Card[],
    details: FetchCardDetails = {},
    directChildrenOnly: boolean = false,
  ): Promise<Card[]> {
    let entries = [];
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return cards;
    }
    let finish = false;
    const currentPaths: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const currentPath = join(entry.parentPath, entry.name);
        currentPaths.push(currentPath);
        if (CardNameRegEx.test(entry.name)) {
          if (directChildrenOnly) {
            // Make recursion stop on the level where first children cards are found.
            finish = true;
          }

          const attachmentFiles: CardAttachment[] = [];
          const promiseContainer = [
            this.getContent(currentPath, details.content),
            this.getMetadata(currentPath, details.metadata),
            this.getChildren(currentPath, details),
            this.getAttachments(
              currentPath,
              attachmentFiles,
              details.attachments,
            ),
          ];
          const [cardContent, cardMetadata, cardChildren] =
            await Promise.all(promiseContainer);

          cards.push({
            key: entry.name,
            path: currentPath,
            children: details.children ? (cardChildren as Card[]) : [],
            attachments: details.attachments ? [...attachmentFiles] : [],
            ...(details.content && { content: cardContent as string }),
            ...(details.metadata && {
              metadata: JSON.parse(cardMetadata as string),
            }),
            ...(details.parent && { parent: this.parentCard(currentPath) }),
          });
        }
      }
    }

    // Continue collecting cards from children
    if (!finish && currentPaths) {
      const promises = currentPaths.map((item) =>
        this.doCollectCards(item, cards, details, directChildrenOnly),
      );
      await Promise.all(promises);
    }
    return cards;
  }

  // Find specific card
  private async doFindCard(
    path: string,
    cardKey: string,
    details: FetchCardDetails = {},
    foundCards: Card[],
  ): Promise<Card[]> {
    const entries = await readdir(path, { withFileTypes: true });
    let asciiDocProcessor;
    // optimization: do not create AsciiDoctor Processor, unless it is needed.
    if (details.contentType && details.contentType === 'html') {
      asciiDocProcessor = asciidoctor();
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const currentPath = join(entry.parentPath, entry.name);
        if (entry.name === cardKey) {
          const attachmentFiles: CardAttachment[] = [];
          const promiseContainer = [
            this.getContent(currentPath, details.content),
            this.getMetadata(currentPath, details.metadata),
            this.getChildren(currentPath, details),
            this.getAttachments(
              currentPath,
              attachmentFiles,
              details.attachments,
            ),
          ];
          const [cardContent, cardMetadata, cardChildren] =
            await Promise.all(promiseContainer);

          const content =
            details.contentType && details.contentType === 'html'
              ? asciiDocProcessor?.convert(cardContent as string)
              : cardContent;

          foundCards.push({
            key: entry.name,
            path: currentPath,
            children: details.children ? (cardChildren as Card[]) : [],
            attachments: details.attachments ? [...attachmentFiles] : [],
            ...(details.content && { content: content as string }),
            ...(details.metadata && {
              metadata: JSON.parse(cardMetadata as string),
            }),
            ...(details.parent && { parent: this.parentCard(currentPath) }),
            ...(details.calculations && { calculations: [] }),
          });
          break; //optimization - there can only be one.
        }
        // Only continue, if the card has not been found.
        if (foundCards.length === 0) {
          await this.doFindCard(currentPath, cardKey, details, foundCards);
        }
      }
    }
    return foundCards;
  }

  // Gets conditionally attachments
  private async getAttachments(
    currentPath: string,
    files: CardAttachment[],
    include?: boolean,
  ): Promise<string | CardAttachment[] | Card[]> {
    return include ? this.doCollectAttachments(currentPath, files) : [];
  }

  // Gets conditionally children
  private async getChildren(
    currentPath: string,
    details: FetchCardDetails = {},
  ): Promise<string | CardAttachment[] | Card[]> {
    return details.children ? this.childrenCards(currentPath, details) : [];
  }

  // Gets conditionally content
  private async getContent(
    currentPath: string,
    include?: boolean,
  ): Promise<string | CardAttachment[] | Card[]> {
    return include
      ? readFile(join(currentPath, CardContainer.cardContentFile), {
          encoding: 'utf-8',
        })
      : '';
  }

  // Gets conditionally metadata
  private async getMetadata(
    currentPath: string,
    include?: boolean,
  ): Promise<string> {
    let metadata = include
      ? await readFile(join(currentPath, CardContainer.cardMetadataFile), {
          encoding: 'utf-8',
        })
      : '';
    metadata = this.injectLinksIfMissing(metadata);
    return metadata;
  }

  // Injects 'links' member - if it is missing - to a string representation of a card.
  private injectLinksIfMissing(metadata: string): string {
    if (metadata !== '' && !metadata.includes('"links":')) {
      const end = metadata.lastIndexOf('}');
      metadata = metadata.slice(0, end - 1) + ',\n    "links": []\n' + '}';
    }
    return metadata;
  }

  // Finds parent
  private parentCard(cardPath: string) {
    const pathParts = cardPath.split(sep);
    if (
      pathParts.at(pathParts.length - 2) === 'cardRoot' ||
      (pathParts.length > 3 &&
        pathParts.at(pathParts.length - 4) === 'templates')
    ) {
      return 'root';
    } else {
      return pathParts.at(pathParts.length - 3);
    }
  }

  // Lists all attachments from container.
  protected async attachments(path: string): Promise<CardAttachment[]> {
    const attachments: CardAttachment[] = [];
    const cards: Card[] = [];
    await this.doCollectCards(path, cards, { attachments: true });

    cards.forEach((card) => {
      if (card.attachments) {
        attachments.push(...card.attachments.flat());
      }
    });

    return attachments;
  }

  // Lists all cards from container.
  protected async cards(
    path: string,
    details: FetchCardDetails = {},
    directChildrenOnly: boolean = false,
  ): Promise<Card[]> {
    const containerCards: Card[] = [];
    await this.doCollectCards(
      path,
      containerCards,
      details,
      directChildrenOnly,
    );
    return containerCards;
  }

  // Finds a specific card.
  protected async findCard(
    path: string,
    cardKey: string,
    details: FetchCardDetails = {},
  ): Promise<Card | undefined> {
    const foundCards: Card[] = [];
    await this.doFindCard(path, cardKey, details, foundCards);
    return foundCards.at(0);
  }

  // Checks if container has the specified card.
  protected hasCard(cardKey: string, path: string): boolean {
    const allFiles = getFilesSync(path);
    const cardIndexJsonFile = join(cardKey, CardContainer.cardMetadataFile);
    const found = allFiles.findIndex((file) =>
      file.includes(cardIndexJsonFile),
    );
    return found !== -1;
  }

  // Persists card content.
  protected async saveCard(card: Card) {
    await this.saveCardContent(card);
    await this.saveCardMetadata(card);
  }

  // Persists card metadata.
  protected async saveCardContent(card: Card) {
    if (card.content != null) {
      const contentFile = join(card.path, CardContainer.cardContentFile);
      await writeFile(contentFile, card.content);
    }
  }

  // Persists card metadata.
  protected async saveCardMetadata(card: Card) {
    if (card.metadata != null) {
      const metadataFile = join(card.path, CardContainer.cardMetadataFile);
      await writeJsonFile(metadataFile, card.metadata);
    }
  }
}
