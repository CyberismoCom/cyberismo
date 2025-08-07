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
import {
  appendFile,
  copyFile,
  mkdir,
  truncate,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { Project } from '../containers/project.js';
import { sortItems } from '../utils/lexorank.js';

import type {
  Card,
  FetchCardDetails,
} from '../interfaces/project-interfaces.js';
import type { QueryResult } from '../types/queries.js';
import type { CardType } from '../interfaces/resource-interfaces.js';
import type { Show } from './index.js';
import { generateReportContent } from '../utils/report.js';
import { getStaticDirectoryPath, pdfReport } from '@cyberismo/assets';
import { spawn } from 'node:child_process';
import { evaluateMacros } from '../macros/index.js';

const attachmentFolder: string = 'a';

interface ExportPdfOptions {
  title: string;
  name: string;
  date?: Date;
  version?: string;
  revremark?: string;
  cardKey?: string;
  recursive?: boolean;
}

export class Export {
  constructor(
    protected project: Project,
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
    const project = this.project;
    try {
      const { evaluateMacros } = await import('../macros/index.js');
      asciiDocContent = await evaluateMacros(
        cardDetailsResponse.content || '',
        {
          context: 'exportedDocument',
          mode: 'static',
          project,
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

  private async runAsciidoctorPdf(content: string): Promise<Buffer> {
    const staticRootDir = await getStaticDirectoryPath();
    const proc = spawn(
      'asciidoctor-pdf',
      [
        '--trace',
        '-a',
        'pdf-theme=cyberismo',
        '-a',
        `pdf-themesdir=${join(staticRootDir, 'pdf-themes')}`,
        '-a',
        `pdf-fontsdir=${join(staticRootDir, 'pdf-themes', 'fonts')};GEM_FONTS_DIR`,
        '-',
      ],
      {
        timeout: 10000,
      },
    );
    proc.stdin.end(content);
    const result = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      proc.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });
      proc.stderr.on('data', (chunk) => {
        process.stderr.write(chunk);
      });
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`Asciidoctor-pdf failed with code ${code}`));
        }
      });
    });
    return result;
  }

  public async exportPdf(
    destination: string,
    options: ExportPdfOptions,
  ): Promise<string> {
    const opts = {
      ...options,
      date: options.date?.toISOString().split('T')[0],
      recursive: options.recursive ?? false,
    };

    const result = await generateReportContent({
      calculate: this.project.calculationEngine,
      contentTemplate: pdfReport.content,
      queryTemplate: pdfReport.query,
      context: 'exportedDocument',
      options: opts,
    });

    const evaluated = await evaluateMacros(result, {
      context: 'exportedDocument',
      mode: 'static',
      project: this.project,
      cardKey: '', // top level report does not contain any macros that use cardKey
    });
    const pdf = await this.runAsciidoctorPdf(evaluated);
    await writeFile(destination, pdf);
    return `Exported PDF to ${destination}`;
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

    await this.project.calculationEngine.generate();
    const tree = await this.project.calculationEngine.runQuery(
      'tree',
      'exportedDocument',
    );

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
}
