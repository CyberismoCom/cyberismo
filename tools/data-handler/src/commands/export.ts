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
import { appendFile, copyFile, mkdir, truncate } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// asciidoctor
import Processor from '@asciidoctor/core';
import type { Calculate, Show } from './index.js';
import type {
  Card,
  FetchCardDetails,
} from '../interfaces/project-interfaces.js';
import type { CardType } from '../interfaces/resource-interfaces.js';
import { Project } from '../containers/project.js';
import type { QueryResult } from '../types/queries.js';
import { sortItems } from '../utils/lexorank.js';

const attachmentFolder: string = 'a';

export class Export {
  constructor(
    protected project: Project,
    protected calculateCmd: Calculate,
    protected showCmd: Show,
  ) {}

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
      content += `|Card key|${card.key}\n`;
      content += `|Status|${card.metadata.workflowState}\n`;
      content += `|Card type|${card.metadata.cardType}\n`;
      content += `|Labels|${card.metadata.labels?.join(', ') || ''}`;

      for (const [key, value] of Object.entries(card.metadata)) {
        if (
          cardType?.alwaysVisibleFields.includes(key) ||
          cardType?.optionallyVisibleFields?.includes(key)
        ) {
          const displayName = cardType?.customFields.find(
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
            escapedValue = value.toString().replaceAll('|', '\\|');
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

      if (card.metadata?.title) {
        fileContent += `== ${card.metadata.title}\n\n`;
      } else {
        fileContent += `== ${card.key}\n\n`;
      }

      if (card.metadata) {
        const cardTypeForCard = await this.project.resource<CardType>(
          card.metadata?.cardType,
        );
        const metaDataContent = this.metaToAdoc(card, cardTypeForCard);
        fileContent += metaDataContent;
      }

      if (card.content) {
        fileContent += card.content;
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

      // Add separator between cards
      fileContent += '\n\n';

      if (fileContent) {
        await appendFile(path, fileContent);
      }

      if (card.children) {
        await this.toAdocFileAsContent(path, card.children);
      }
    }
  }

  /**
   * Recursively searches for a card with the specified key in the tree hierarchy.
   * @param treeItems Array of tree query results to search through
   * @param targetKey The key of the card to find
   * @returns The found tree item or null if not found
   */
  protected findCardInTree(
    treeItems: QueryResult<'tree'>[],
    targetKey: string,
  ): QueryResult<'tree'> | null {
    for (const item of treeItems) {
      if (item.key === targetKey) {
        return item;
      }
      if (item.children && item.children.length > 0) {
        const foundInChildren = this.findCardInTree(item.children, targetKey);
        if (foundInChildren) {
          return foundInChildren;
        }
      }
    }
    return null;
  }

  /**
   * Convert treeQueryResult object into a Card object and add content, metadata & attachments
   * Handles card children recursively
   * @param treeQueryResult tree query result object
   */
  protected async treeQueryResultToCard(
    treeQueryResult: QueryResult<'tree'>,
  ): Promise<Card> {
    const card: Card = {
      key: treeQueryResult.key,
      path: '',
      children: [],
      attachments: [],
    };

    // Get content and attachments separately, not included in queries
    const fetchCardDetails: FetchCardDetails = {
      attachments: true,
      children: false,
      content: true,
      contentType: 'adoc',
      metadata: true,
      parent: false,
    };

    const cardDetailsResponse = await this.showCmd.showCardDetails(
      fetchCardDetails,
      card.key,
    );

    let asciiDocContent = '';
    const projectPath = this.project.basePath;
    try {
      const { evaluateMacros } = await import('../macros/index.js');
      asciiDocContent = await evaluateMacros(
        cardDetailsResponse.content || '',
        {
          mode: 'static',
          projectPath,
          cardKey: card.key,
        },
      );
    } catch (error) {
      asciiDocContent = `Macro error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n${asciiDocContent}`;
    }

    card.path = cardDetailsResponse.path;
    card.metadata = cardDetailsResponse.metadata;
    card.metadata!.progress = treeQueryResult.progress;
    card.content = asciiDocContent;
    card.attachments = cardDetailsResponse.attachments;

    for (const result of treeQueryResult.children ?? []) {
      card.children!.push(await this.treeQueryResultToCard(result));
    }

    return card;
  }

  /**
   * Exports the card(s) to ascii doc.
   * @param destination Path to where the resulting file(s) will be created.
   * @param cardKey If not exporting the whole card tree, card key of parent card.
   * @returns status message
   */
  public async exportToADoc(
    destination: string,
    cardKey?: string,
  ): Promise<string> {
    const sourcePath: string = this.project.paths.cardRootFolder;
    let cards: Card[] = [];

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

    if (cardKey) {
      const targetCard = this.findCardInTree(tree, cardKey);
      if (!targetCard) {
        throw new Error(`Cannot find card '${cardKey}' in the tree hierarchy`);
      }
      cards = [await this.treeQueryResultToCard(targetCard)];
    } else {
      for (const treeQueryResult of tree) {
        cards.push(await this.treeQueryResultToCard(treeQueryResult));
      }
    }

    // Sort the cards by rank
    cards = sortItems(cards, function (card) {
      return card.metadata?.rank || '1|z';
    });

    await mkdir(join(destination, attachmentFolder), { recursive: true });
    const resultDocumentPath: string = join(
      destination,
      Project.cardContentFile,
    );
    let message = '';
    try {
      await truncate(resultDocumentPath, 0);
      message = `Using existing output file '${resultDocumentPath}'`;
    } catch {
      message = `Creating output file '${resultDocumentPath}'`;
    }

    await this.toAdocFile(resultDocumentPath, cards);
    return message;
  }

  /**
   * Exports the card(s) to HTML and opens the browser.
   * @param destination Path to where the resulting file(s) will be created.
   * @param cardKey Optional; If not exporting the whole card tree, card key of parent card.
   */
  public async exportToHTML(
    destination: string,
    cardKey?: string,
  ): Promise<string> {
    let message = '';
    await this.exportToADoc(destination, cardKey).then((msg) => {
      message = msg;
      const asciiDocProcessor = Processor();
      const adocFile = join(destination, Project.cardContentFile);
      asciiDocProcessor.convertFile(adocFile, {
        safe: 'safe',
        base_dir: '/',
        standalone: true,
      });
    });
    return message;
  }
}
