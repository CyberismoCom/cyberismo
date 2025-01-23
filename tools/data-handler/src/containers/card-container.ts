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

import { getFilesSync } from '../utils/file-utils.js';
import { writeJsonFile } from '../utils/json.js';

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
    return await this.doCollectCards(cardPath, details, true);
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

  // Gets conditionally attachments
  private async getAttachments(
    currentPath: string,
    include?: boolean,
  ): Promise<CardAttachment[]> {
    if (include) {
      return this.doCollectAttachments(currentPath);
    }
    return [];
  }

  // Gets conditionally children
  private async getChildren(
    currentPath: string,
    details: FetchCardDetails = {},
  ): Promise<string | CardAttachment[] | Card[]> {
    return details.children ? this.childrenCards(currentPath, details) : [];
  }

  // Injects 'links' member - if it is missing - to a string representation of a card.
  private injectLinksIfMissing(metadata: string): string {
    if (metadata !== '' && !metadata.includes('"links":')) {
      const end = metadata.lastIndexOf('}');
      metadata = metadata.slice(0, end - 1) + ',\n    "links": []\n' + '}';
    }
    return metadata;
  }

  // Function collects attachments from all cards in one folder.
  private async doCollectAttachments(
    folder: string,
  ): Promise<CardAttachment[]> {
    const currentCard = basename(folder);
    const attachmentFolder = join(folder, 'a');
    const attachments: CardAttachment[] = [];

    try {
      const entryAttachments = await readdir(attachmentFolder, {
        withFileTypes: true,
      });
      entryAttachments.forEach((attachment) =>
        attachments.push({
          card: currentCard,
          fileName: attachment.name,
          path: attachment.parentPath,
          mimeType: mime.lookup(attachment.name) || null,
        }),
      );
      return attachments;
    } catch {
      return [];
    }
  }

  // Collects all cards from container.
  private async doCollectCards(
    path: string,
    details: FetchCardDetails = {},
    directChildrenOnly: boolean = false,
  ): Promise<Card[]> {
    const cards: Card[] = [];
    const entries = (
      await readdir(path, {
        withFileTypes: true,
        recursive: true,
      })
    ).filter((item) => {
      return item.isDirectory() && CardNameRegEx.test(item.name);
    });

    for (const entry of entries) {
      const currentPath = join(entry.parentPath, entry.name);
      const promiseContainer = [
        this.getContent(currentPath, details.content),
        this.getMetadata(currentPath, details.metadata),
        this.getChildren(currentPath, details),
        this.getAttachments(currentPath, details.attachments),
      ];
      const [cardContent, cardMetadata, cardChildren, attachments] =
        await Promise.all(promiseContainer);

      cards.push({
        key: entry.name,
        path: currentPath,
        children: details.children ? (cardChildren as Card[]) : [],
        attachments: attachments as CardAttachment[],
        ...(details.content && { content: cardContent as string }),
        ...(details.metadata && {
          metadata: JSON.parse(cardMetadata as string),
        }),
        ...(details.parent && { parent: this.parentCard(currentPath) }),
      });
    }
    if (directChildrenOnly) {
      return cards.filter(
        (item) => this.parentCard(item.path) === basename(path),
      );
    }
    return cards;
  }

  // Lists all attachments from container.
  protected async attachments(path: string): Promise<CardAttachment[]> {
    const attachments: CardAttachment[] = [];
    const cards = await this.doCollectCards(path, { attachments: true });

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
    const containerCards = await this.doCollectCards(
      path,
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
    const entries = await readdir(path, {
      withFileTypes: true,
      recursive: true,
    });
    let asciiDocProcessor;
    // optimization: do not create AsciiDoctor Processor, unless it is needed.
    if (details.contentType && details.contentType === 'html') {
      asciiDocProcessor = asciidoctor();
    }

    const found = entries.find((item) => {
      return item.isDirectory() && item.name === cardKey;
    });
    if (!found) {
      return undefined;
    }

    const foundPath = join(found.parentPath, found.name);
    const promiseContainer = [
      this.getContent(foundPath, details.content),
      this.getMetadata(foundPath, details.metadata),
      this.getChildren(foundPath, details),
      this.getAttachments(foundPath, details.attachments),
    ];
    const [cardContent, cardMetadata, cardChildren, attachments] =
      await Promise.all(promiseContainer);

    const content =
      details.contentType && details.contentType === 'html'
        ? asciiDocProcessor?.convert(cardContent as string)
        : cardContent;

    return {
      key: found.name,
      path: foundPath,
      children: details.children ? (cardChildren as Card[]) : [],
      attachments: attachments as CardAttachment[],
      ...(details.content && { content: content as string }),
      ...(details.metadata && {
        metadata: JSON.parse(cardMetadata as string),
      }),
      ...(details.parent && { parent: this.parentCard(foundPath) }),
      ...(details.calculations && { calculations: [] }),
    };
  }

  // Checks if container has the specified card.
  // @note this is rather IO-heavy function, as it fetches all the files in the path.
  // @todo: there could be a "get specific file sync" that does getFilesSync
  //        but with a search param; once found -> recursion would stop
  protected hasCard(cardKey: string, path: string): boolean {
    const allFiles = getFilesSync(path);
    const cardIndexJsonFile = join(cardKey, CardContainer.cardMetadataFile);
    return allFiles.some((file) => file.includes(cardIndexJsonFile));
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
