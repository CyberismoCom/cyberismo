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

  // Lists all direct children.
  private async childrenCards(cardPath: string, details?: FetchCardDetails) {
    const containerCards: Card[] = [];
    await this.doCollectCards(cardPath, containerCards, details, true);
    return containerCards;
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
  ): Promise<string | CardAttachment[] | Card[]> {
    return include
      ? readFile(join(currentPath, CardContainer.cardMetadataFile), {
          encoding: 'utf-8',
        })
      : '';
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

  // Find specific card
  // todo: combine doFind & doCollect
  private async doFindCard(
    path: string,
    cardKey: string,
    details: FetchCardDetails = {},
    foundCards: Card[],
  ): Promise<Card[]> {
    const entries = await readdir(path, { withFileTypes: true });
    if (foundCards.length > 0) {
      return foundCards;
    }

    let asciiDocProcessor;
    // optimization: do not create AsciiDoctor Processor, unless it is needed.
    if (details.contentType && details.contentType === 'html') {
      asciiDocProcessor = asciidoctor();
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const currentPath = join(entry.path, entry.name);
        if (CardNameRegEx.test(entry.name)) {
          // todo: from hereon, this could be shared with doCollect
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
              ...(details.content && { content: content as string }),
              ...(details.metadata && {
                metadata: JSON.parse(cardMetadata as string),
              }),
              ...(details.parent && { parent: this.parentCard(currentPath) }),
              ...(details.children && { children: cardChildren as Card[] }),
              ...(details.calculations && { calculations: [] }),
              ...(details.attachments && { attachments: [...attachmentFiles] }),
            });
            break; //optimization - there can only be one.
          }
        }
        await this.doFindCard(currentPath, cardKey, details, foundCards);
      }
    }
    return foundCards;
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
          currentPaths.push(join(entry.path, entry.name));
        } else if (entry.name === 'c') {
          continue;
        } else if (entry.name === 'a') {
          const attachmentFolder = join(entry.path, entry.name);
          const cardItem = basename(entry.path) || '';
          const entryAttachments = await readdir(attachmentFolder, {
            withFileTypes: true,
          });
          entryAttachments.forEach((attachment) =>
            attachments.push({
              card: cardItem,
              fileName: attachment.name,
              path: attachment.path,
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
    const entries = await readdir(path, { withFileTypes: true });
    let finish = false;
    const currentPaths: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const currentPath = join(entry.path, entry.name);
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
            ...(details.content && { content: cardContent as string }),
            ...(details.metadata && {
              metadata: JSON.parse(cardMetadata as string),
            }),
            ...(details.parent && { parent: this.parentCard(currentPath) }),
            ...(details.children && { children: cardChildren as Card[] }),
            ...(details.attachments && { attachments: [...attachmentFiles] }),
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
    if (card.content != null) {
      const contentFile = join(card.path, CardContainer.cardContentFile);
      await writeFile(contentFile, card.content);
      return;
    }
    if (card.metadata) {
      const metadataFile = join(card.path, CardContainer.cardMetadataFile);
      await writeJsonFile(metadataFile, card.metadata);
      return;
    }
    throw new Error(`No content for card ${card.key}`);
  }
  // Persists card metadata.
  protected async saveCardMetadata(card: Card) {
    if (card.metadata) {
      const metadataFile = join(card.path, CardContainer.cardMetadataFile);
      await writeJsonFile(metadataFile, card.metadata);
      return;
    }
    throw new Error(`No metadata for card ${card.key}`);
  }
}
