/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { appendFile, copyFile, mkdir, truncate } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import {
  Card,
  CardType,
  FetchCardDetails,
} from './interfaces/project-interfaces.js';
import { pathExists } from './utils/file-utils.js';
import { Project } from './containers/project.js';

// asciidoctor
import Processor from '@asciidoctor/core';

import { sortItems } from './utils/lexorank.js';
import { QueryResult } from './types/queries.js';
import { Show } from './show.js';
import { Calculate } from './calculate.js';

const attachmentFolder: string = 'a';

export class Export {
  static project: Project;

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
   * Convert treeQueryResult object into a Card object and add content, metadata & attachments
   * Handles card children recursively
   * @param treeQueryResult tree query result object
   * @param projectPath path of project under export
   */
  protected async treeQueryResultToCard(
    treeQueryResult: QueryResult<'tree'>,
    projectPath: string,
  ): Promise<Card> {
    const card: Card = {
      key: treeQueryResult.key,
      path: '',
      children: [],
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

    const showCommand = new Show();
    const cardDetailsResponse = await showCommand.showCardDetails(
      projectPath,
      fetchCardDetails,
      card.key,
    );

    card.path = cardDetailsResponse.path;
    card.metadata = cardDetailsResponse.metadata;
    card.metadata!.progress = treeQueryResult['base/fieldTypes/progress'];
    card.content = cardDetailsResponse.content;
    card.attachments = cardDetailsResponse.attachments;

    for (const result of treeQueryResult.results) {
      card.children!.push(
        await this.treeQueryResultToCard(result, projectPath),
      );
    }

    return card;
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
    const sourcePath: string = Export.project.paths.cardRootFolder;
    let cards: Card[] = [];

    // If doing a partial tree export, put the parent information as it would have already been gathered.
    if (cardKey) {
      cards.push({
        key: cardKey,
        path: sourcePath,
      });
    }

    const calculate = new Calculate();
    await calculate.generate(source);
    const tree = await calculate.runQuery(source, 'tree');
    for (const treeQueryResult of tree) {
      cards.push(await this.treeQueryResultToCard(treeQueryResult, source));
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
