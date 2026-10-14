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
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import type {
  AdocFiles,
  Card,
  CardType,
  ExportedPdf,
  ExportPdfOptions,
  QueryResult,
} from '@cyberismo/model';
import { evaluateMacros } from '../macros/index.js';
import { generateReportContent } from '../queries/report.js';
import { preprocessMermaidBlocksForPdf } from '../../shared/utils/mermaid-renderer.js';
import { rewriteAsciidocCardXrefs } from '../../shared/utils/asciidoc-xref.js';
import { getStaticDirectoryPath, pdfReport } from '@cyberismo/assets';
import { Checkout } from '../../infra/checkout.js';
import { ROOT } from '../../shared/utils/constants.js';
import { read } from '../../infra/rw-lock.js';
import { sortItems } from '../../shared/utils/lexorank.js';
import { findCard, cardsByKeys } from '../cards/read.js';

// The document the PDF is rendered from.
type PdfDocument = Omit<ExportPdfOptions, 'date'> & { date?: Date };

const attachmentFolder: string = 'a';
const ASCIIDOCTOR_DIAGNOSTIC = /^asciidoctor: (WARNING|ERROR):/;
const FAILURE_DIAGNOSTIC_LINES = 20;

// To what format the content can be exported to.
export enum ExportFormats {
  adoc = 'adoc',
  site = 'site',
  pdf = 'pdf',
}

// Diagnostics can contain server paths, so they stay out of the message
export class AsciidoctorPdfError extends Error {
  constructor(
    code: number | null,
    public readonly diagnostics: string[],
  ) {
    super(`Asciidoctor-pdf failed with code ${code}`);
  }
}

/**
 * Handles all export commands.
 */
export class Export {
  /** @internal */
  protected checkout: Checkout;

  /**
   * Creates an instance of export.
   * @param checkout Project to use
   * @internal
   */
  constructor(checkout: Checkout) {
    this.checkout = checkout;
  }

  // This file should set the top level items to the adoc.
  private async toAdocFile(files: AdocFiles, cards: Card[]) {
    const content = [`:imagesdir: ./${attachmentFolder}/\n`];
    await this.toAdocFileAsContent(files, content, cards);
    files[Checkout.cardContentFile] = Buffer.from(content.join(''));
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

  // Runs Asciidoctor PDF; its diagnostics are returned rather than printed
  private async runAsciidoctorPdf(
    content: string,
  ): Promise<{ pdf: Buffer; warnings: string[] }> {
    const staticRootDir = await getStaticDirectoryPath();
    const proc = spawn(
      'asciidoctor-pdf',
      [
        // Card content is untrusted: SECURE blocks include:: reading server files.
        // It also locks icons and source-highlighter off, so both are restored here;
        // a command-line attribute cannot be overridden from a card.
        '--safe-mode',
        'secure',
        '-a',
        'source-highlighter=rouge',
        '-a',
        'icons=font',
        // SECURE does not jail image paths. Pin imagesdir and unset every document
        // attribute that asciidoctor-pdf resolves as an image (cover, background,
        // foreground, title-page logo); a locked command-line attribute cannot be
        // re-set from the document, and the export title/name reach the header.
        // asciidoctor-pdf does not jail absolute image:: targets; that is left to
        // the deployment and tracked separately.
        '-a',
        'imagesdir=images',
        '-a',
        'front-cover-image!',
        '-a',
        'back-cover-image!',
        '-a',
        'page-background-image!',
        '-a',
        'page-background-image-recto!',
        '-a',
        'page-background-image-verso!',
        '-a',
        'title-page-background-image!',
        '-a',
        'page-foreground-image!',
        '-a',
        'title-logo-image!',
        '-a',
        'pdf-theme=cyberismo',
        '-a',
        `pdf-themesdir=${join(staticRootDir, 'pdf-themes')}`,
        '-a',
        `pdf-fontsdir=${join(staticRootDir, 'pdf-themes', 'fonts')};GEM_FONTS_DIR`,
        '-',
      ],
      {
        timeout: 100000,
        shell: process.platform === 'win32',
      },
    );
    proc.stdin.end(content);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const errorChunks: Buffer[] = [];
      proc.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });
      proc.stderr.on('data', (chunk) => {
        errorChunks.push(chunk);
      });
      proc.on('error', (error) => {
        if ('code' in error && error.code === 'ENOENT') {
          reject(
            new Error(
              'Asciidoctor-pdf not found. Please install asciidoctor-pdf to use this feature.',
            ),
          );
        }
        reject(error);
      });
      proc.on('close', (code) => {
        const diagnostics = Buffer.concat(errorChunks)
          .toString()
          .split('\n')
          .filter((line) => line.trim() !== '');
        if (code === 0) {
          resolve({
            pdf: Buffer.concat(chunks),
            warnings: diagnostics.filter((line) =>
              ASCIIDOCTOR_DIAGNOSTIC.test(line),
            ),
          });
        } else {
          reject(
            new AsciidoctorPdfError(
              code,
              diagnostics.slice(-FAILURE_DIAGNOSTIC_LINES),
            ),
          );
        }
      });
    });
  }

  // Adds cards to an ADOC file as additional content.
  private async toAdocFileAsContent(
    files: AdocFiles,
    content: string[],
    cards: Card[],
  ) {
    for (const card of cards) {
      let fileContent = '';

      if (card.metadata?.title) {
        fileContent += `== ${card.metadata.title}\n\n`;
      } else {
        fileContent += `== ${card.key}\n\n`;
      }

      if (card.metadata) {
        const cardTypeForCard = this.checkout.resources
          .byType(card.metadata?.cardType, 'cardTypes')
          .show();
        const metaDataContent = this.metaToAdoc(card, cardTypeForCard);
        fileContent += metaDataContent;
      }

      if (card.content) {
        fileContent += card.content;
      }

      if (card.attachments) {
        const attachments = await Promise.all(
          card.attachments.map((attachment) =>
            readFile(join(attachment.path, attachment.fileName)),
          ),
        );
        card.attachments.forEach((attachment, index) => {
          files[`${attachmentFolder}/${attachment.fileName}`] =
            attachments[index];
        });
      }

      // Add separator between cards
      fileContent += '\n\n';

      if (fileContent) {
        content.push(fileContent);
      }

      if (card.children) {
        await this.toAdocFileAsContent(
          files,
          content,
          sortItems(
            cardsByKeys(this.checkout, card.children),
            (child) => child.metadata?.rank || '1|z',
          ),
        );
      }
    }
  }

  private async evaluateExportContent(options: PdfDocument): Promise<string> {
    const result = await generateReportContent({
      calculate: this.checkout.calculationEngine,
      contentTemplate: pdfReport.content,
      queryTemplate: pdfReport.query,
      context: 'exportedDocument',
      options: {
        ...options,
        date: options.date?.toISOString().split('T')[0],
        recursive: options.recursive ?? false,
      },
    });
    const evaluated = await evaluateMacros(result, {
      context: 'exportedDocument',
      mode: 'static',
      checkout: this.checkout,
      cardKey: '', // top level report does not contain any macros that use cardKey
    });
    return evaluated;
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
   * @returns Tree query result as a Card.
   */
  protected async treeQueryResultToCard(
    treeQueryResult: QueryResult<'tree'>,
  ): Promise<Card> {
    const card: Card = {
      key: treeQueryResult.key,
      path: '',
      parent: ROOT,
      children: [],
      attachments: [],
    };
    const cardDetailsResponse = findCard(this.checkout, card.key);
    let asciiDocContent = '';
    const checkout = this.checkout;
    try {
      const { evaluateMacros } = await import('../macros/index.js');
      asciiDocContent = await evaluateMacros(
        cardDetailsResponse.content || '',
        {
          context: 'exportedDocument',
          mode: 'static',
          checkout,
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
      card.children!.push((await this.treeQueryResultToCard(result)).key);
    }

    return card;
  }

  /**
   * Assembles the AsciiDoc source that will be handed to asciidoctor-pdf.
   * Runs macro evaluation, mermaid preprocessing, and native-xref rewriting in
   * the order Asciidoctor expects.
   */
  protected async buildPdfAsciidocSource(
    options: PdfDocument,
    onWarning?: (message: string) => void,
  ): Promise<string> {
    const evaluated = await this.evaluateExportContent(options);
    const withMermaid = await preprocessMermaidBlocksForPdf(evaluated);
    return rewriteAsciidocCardXrefs(
      withMermaid,
      this.checkout,
      'static',
      onWarning,
    );
  }

  // Builds the PDF, collecting warnings instead of printing them
  private async renderPdf(
    options: PdfDocument,
  ): Promise<{ pdf: Buffer; warnings: string[] }> {
    const warnings: string[] = [];
    const source = await this.buildPdfAsciidocSource(options, (message) =>
      warnings.push(message),
    );
    const result = await this.runAsciidoctorPdf(source);
    return { pdf: result.pdf, warnings: [...warnings, ...result.warnings] };
  }

  /**
   * Renders the card(s) as a PDF, with its rendering warnings. Unset document
   * fields default to Title, Name, 1.0.0, Initial version and today.
   * @throws AsciidoctorPdfError when asciidoctor-pdf fails; its diagnostics
   *   stay off the message.
   */
  @read
  public async pdf(options: ExportPdfOptions): Promise<ExportedPdf> {
    return this.renderPdf({
      ...options,
      title: options.title || 'Title',
      name: options.name || 'Name',
      version: options.version || '1.0.0',
      revremark: options.revremark || 'Initial version',
      date: options.date ? new Date(options.date) : new Date(),
    });
  }

  /**
   * The card(s) as an AsciiDoc document with its attachments, by path:
   * 'index.adoc' and 'a/<file name>'.
   * @param cardKey If not exporting the whole card tree, card key of parent card.
   */
  @read
  public async adoc(cardKey?: string): Promise<AdocFiles> {
    const sourcePath: string = this.checkout.paths.cardRootFolder;
    let cards: Card[] = [];

    // If doing a partial tree export, put the parent information as it would have already been gathered.
    if (cardKey && findCard(this.checkout, cardKey)) {
      cards.push({
        key: cardKey,
        path: sourcePath,
        parent: ROOT,
        children: [],
        attachments: [],
      });
    }

    const tree = await this.checkout.calculationEngine.runQuery(
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

    const files: AdocFiles = {};
    await this.toAdocFile(files, cards);
    return files;
  }
}
