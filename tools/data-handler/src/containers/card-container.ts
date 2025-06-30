/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { basename, join, sep } from 'node:path';
import type { Dirent } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';

import { findParentPath } from '../utils/card-utils.js';
import { readJsonFile } from '../utils/json.js';
import { writeJsonFile } from '../utils/json.js';
import { getFilesSync } from '../utils/file-utils.js';

// interfaces
import {
  type CardAttachment,
  type Card,
  type CardMetadata,
  CardNameRegEx,
  type FetchCardDetails,
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
    let entries: Dirent[] = [];
    try {
      entries = (await readdir(folder, { withFileTypes: true })).filter(
        (item) => item.isDirectory(),
      );
    } catch {
      // ignore throws, if currentPaths does not have more values, recursion will stop
    }
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
        let entryAttachments: Dirent[] = [];
        try {
          entryAttachments = await readdir(attachmentFolder, {
            withFileTypes: true,
          });
        } catch {
          // ignore readdir errors
        }
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
      card.metadata!.lastUpdated = new Date().toISOString();
      await writeJsonFile(metadataFile, card.metadata);
    }
  }

  /**
   * Show cards with hierarchy structure from a given path.
   * @param path The path to read cards from
   * @returns an array of cards with proper parent-child relationships.
   */
  protected async showCards(path: string): Promise<Card[]> {
    const cards: Card[] = [];
    const cardPathMap = new Map<string, Card>();
    const entries = await readdir(path, {
      withFileTypes: true,
      recursive: true,
    });

    // Checks if Dirent folder is a card folder
    function cardFolder(
      entry: Dirent,
      cardPathMap: Map<string, Card>,
    ): Card | undefined {
      const fullPath = join(entry.parentPath, entry.name);
      if (!cardPathMap.has(fullPath)) {
        const newCard: Card = {
          key: entry.name,
          path: fullPath,
          children: [],
          attachments: [],
        };
        cardPathMap.set(fullPath, newCard);
        return newCard;
      }
    }

    // Process card directories first
    entries
      .filter((entry) => entry.isDirectory() && CardNameRegEx.test(entry.name))
      .forEach((entry) => {
        const card = cardFolder(entry, cardPathMap);
        if (card) cards.push(card);
      });

    // Process metadata files in parallel
    await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isFile() && entry.name === CardContainer.cardMetadataFile,
        )
        .map(async (entry) => {
          const parentCard = cardPathMap.get(entry.parentPath);
          if (!parentCard) return;
          parentCard.metadata = (await readJsonFile(
            join(entry.parentPath, entry.name),
          )) as CardMetadata;
        }),
    );

    // Finally, build the card hierarchy
    Array.from(cardPathMap.entries()).map(([cardPath, card]) => {
      const parentPath = findParentPath(cardPath);
      if (!parentPath) return;
      const parentCard = cardPathMap.get(parentPath);
      if (!parentCard) return;

      parentCard.children.push(card);
      const index = cards.indexOf(card);
      if (index > -1) {
        cards.splice(index, 1);
      }
    });
    return cards;
  }
}
