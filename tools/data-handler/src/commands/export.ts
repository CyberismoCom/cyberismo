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
import { spawn } from 'node:child_process';

import type { Card } from '../interfaces/project-interfaces.js';
import type { CardType } from '../interfaces/resource-interfaces.js';
import { evaluateMacros } from '../macros/index.js';
import type { ExportPdfOptions } from '../interfaces/project-interfaces.js';
import { generateReportContent } from '../utils/report.js';
import { preprocessMermaidBlocksForPdf } from '../utils/mermaid-renderer.js';
import { rewriteAsciidocCardXrefs } from '../utils/asciidoc-xref.js';
import { getStaticDirectoryPath, pdfReport } from '@cyberismo/assets';
import { Project } from '../containers/project.js';
import { ROOT } from '../utils/constants.js';
import type { QueryResult } from '../types/queries.js';
import { read } from '../utils/rw-lock.js';
import type { Show } from './show.js';
import { sortItems } from '../utils/lexorank.js';

const attachmentFolder: string = 'a';
const ASCIIDOCTOR_DIAGNOSTIC = /^asciidoctor: (WARNING|ERROR):/;
const FAILURE_DIAGNOSTIC_LINES = 20;

// Diagnostics can contain server paths, so they stay out of the message
class AsciidoctorPdfError extends Error {
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
  /**
   * Creates an instance of export.
   * @param project Project to use
   * @param showCmd Instance of Export command to use.
   */
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
  private async toAdocFileAsContent(path: string, cards: Card[]) {
    for (const card of cards) {
      let fileContent = '';

      if (card.metadata?.title) {
        fileContent += `== ${card.metadata.title}\n\n`;
      } else {
        fileContent += `== ${card.key}\n\n`;
      }

      if (card.metadata) {
        const cardTypeForCard = this.project.resources
          .byType(card.metadata?.cardType, 'cardTypes')
          .show();
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
        await this.toAdocFileAsContent(
          path,
          sortItems(
            this.project.cardKeysToCards(card.children),
            (child) => child.metadata?.rank || '1|z',
          ),
        );
      }
    }
  }

  private async evaluateExportContent(
    options: ExportPdfOptions,
  ): Promise<string> {
    const result = await generateReportContent({
      calculate: this.project.calculationEngine,
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
      project: this.project,
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
    const cardDetailsResponse = await this.showCmd.showCardDetails(card.key);
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
    options: ExportPdfOptions,
    onWarning?: (message: string) => void,
  ): Promise<string> {
    const evaluated = await this.evaluateExportContent(options);
    const withMermaid = await preprocessMermaidBlocksForPdf(evaluated);
    return rewriteAsciidocCardXrefs(
      withMermaid,
      this.project,
      'static',
      onWarning,
    );
  }

  // Builds the PDF, collecting warnings instead of printing them
  private async renderPdf(
    options: ExportPdfOptions,
  ): Promise<{ pdf: Buffer; warnings: string[] }> {
    const warnings: string[] = [];
    const source = await this.buildPdfAsciidocSource(options, (message) =>
      warnings.push(message),
    );
    const result = await this.runAsciidoctorPdf(source);
    return { pdf: result.pdf, warnings: [...warnings, ...result.warnings] };
  }

  /**
   * Exports the card(s) to pdf.
   * @param destination Path to where the resulting file(s) will be created.
   * @param options Export options.
   * @returns status message
   */
  @read
  public async exportPdf(
    destination: string,
    options: ExportPdfOptions,
  ): Promise<string> {
    let rendered;
    try {
      rendered = await this.renderPdf(options);
    } catch (error) {
      if (error instanceof AsciidoctorPdfError) {
        throw new Error([error.message, ...error.diagnostics].join('\n'), {
          cause: error,
        });
      }
      throw error;
    }
    const { pdf, warnings } = rendered;
    await writeFile(destination, pdf);
    const summary =
      warnings.length === 1
        ? ' with 1 rendering warning'
        : warnings.length > 1
          ? ` with ${warnings.length} rendering warnings`
          : '';
    return `Content exported as PDF to ${destination}${summary}`;
  }

  /**
   * Exports the card(s) as a pdf buffer.
   * @param options Export options.
   * @returns buffer
   */
  @read
  public async exportPdfBuffer(options: ExportPdfOptions): Promise<Buffer> {
    try {
      return (await this.renderPdf(options)).pdf;
    } catch (error) {
      if (error instanceof AsciidoctorPdfError) {
        console.error(error.message, error.diagnostics.join('\n'));
      }
      throw error;
    }
  }

  /**
   * Exports the card(s) to ascii doc.
   * @param destination Path to where the resulting file(s) will be created.
   * @param cardKey If not exporting the whole card tree, card key of parent card.
   * @returns status message
   */
  @read
  public async exportToADoc(
    destination: string,
    cardKey?: string,
  ): Promise<string> {
    const sourcePath: string = this.project.paths.cardRootFolder;
    let cards: Card[] = [];

    // If doing a partial tree export, put the parent information as it would have already been gathered.
    if (cardKey && this.project.findCard(cardKey)) {
      cards.push({
        key: cardKey,
        path: sourcePath,
        parent: ROOT,
        children: [],
        attachments: [],
      });
    }

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
    let message: string;
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
