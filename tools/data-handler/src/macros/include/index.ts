/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { evaluateMacros, validateMacroContent } from '../index.js';

import type { IncludeMacroOptions } from './types.js';
import type { MacroGenerationContext } from '../../interfaces/macros.js';
import macroMetadata from './metadata.js';
import BaseMacro from '../base-macro.js';
import type TaskQueue from '../task-queue.js';
import { MAX_LEVEL_OFFSET } from '../../utils/constants.js';
import { escapeCsvField } from '../../utils/csv.js';
import { escapeJsonString } from '../../utils/json.js';
import {
  closeUnterminatedBlock,
  verbatimBlockTerminator,
} from '../../utils/asciidoc-blocks.js';

export default class IncludeMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (_: MacroGenerationContext, input: unknown) => {
    this.validate(input);
  };

  handleStatic = async (
    context: MacroGenerationContext,
    input: unknown,
  ): Promise<string> => {
    const options = this.validate(input);
    if (!options.title) {
      options.title = 'include';
    }
    if (!options.pageTitles) {
      options.pageTitles = 'normal';
    }

    // Validate incompatible option combinations
    if (options.escape && options.title !== 'exclude') {
      throw new Error(
        'The "escape" option can only be used with "title": "exclude". ' +
          'Escaping is meant for embedding raw content in JSON/CSV documents, not for generating AsciiDoc output.',
      );
    }
    const newContext = {
      ...context,
      cardKey: options.cardKey,
    };
    const card = this.getCard(options.cardKey, context);
    const anchor = this.generateAnchor(options);
    const title = this.generateTitle(options, card.metadata?.title);
    const cardContent = await this.generateCardContent(
      options,
      context.project.cardContent(options.cardKey),
      newContext,
    );

    // Skip the leading newlines if trim is enabled
    const content = `\n\n${anchor}${title}${cardContent}`;

    let levelOffset = 0;
    if (options.levelOffset) {
      levelOffset = parseInt(options.levelOffset, 10);
      if (isNaN(levelOffset)) {
        throw new Error(`Invalid level offset: ${options.levelOffset}`);
      }
      levelOffset = Math.min(
        Math.max(levelOffset, -MAX_LEVEL_OFFSET),
        MAX_LEVEL_OFFSET,
      );
    }

    const adjustedContent = this.adjustTitles(
      content,
      levelOffset,
      options.pageTitles === 'discrete',
    );
    return options.whitespace === 'trim'
      ? adjustedContent.trim()
      : adjustedContent;
  };

  private validate(input: unknown): IncludeMacroOptions {
    return validateMacroContent<IncludeMacroOptions>(this.metadata, input);
  }

  private generateAnchor(options: IncludeMacroOptions): string {
    return options.title !== 'exclude' && options.pageTitles === 'normal'
      ? `[[${options.cardKey}]]\n`
      : '';
  }

  private generateTitle(
    options: IncludeMacroOptions,
    cardTitle?: string,
  ): string {
    if (options.title === 'only' || options.title === 'include') {
      return `= ${cardTitle}\n\n`;
    }
    return '';
  }

  private async generateCardContent(
    options: IncludeMacroOptions,
    cardContent: string | undefined,
    context: MacroGenerationContext,
  ): Promise<string> {
    if (options.title !== 'only') {
      const content = await evaluateMacros(cardContent ?? '', context, true);
      if (options.escape === 'json') {
        return escapeJsonString(content);
      } else if (options.escape === 'csv') {
        return escapeCsvField(content);
      }
      // Keep a block left open in the included card from swallowing what follows
      return closeUnterminatedBlock(content);
    }
    return '';
  }

  private getCard(cardKey: string, context: MacroGenerationContext) {
    return context.project.cardNode(cardKey);
  }

  // Adjust asciidoc titles to match the level offset
  private adjustTitles(
    content: string,
    levelOffset: number,
    discrete: boolean,
  ) {
    const lines = content.split('\n');
    let verbatimTerminator: string | undefined;
    const adjustedLines = lines.map((line) => {
      if (verbatimTerminator) {
        if (line.trimEnd() === verbatimTerminator) {
          verbatimTerminator = undefined;
        }
        return line;
      }
      verbatimTerminator = verbatimBlockTerminator(line);
      // A section title starts at column 0 and has a space after the marker;
      // this excludes block delimiters such as '====' and '#highlighted#' text
      const match = verbatimTerminator
        ? null
        : line.match(/^([=#]{1,6})[ \t]+(\S.*?)\s*$/);
      if (match) {
        const currentLevel = match[1].length;
        const newLevel = Math.min(
          Math.max(1, currentLevel + levelOffset),
          MAX_LEVEL_OFFSET + 1,
        );
        const equals = '='.repeat(newLevel);
        return `${discrete ? '[discrete]\n' : ''}${equals} ${match[2]}`;
      }
      return line;
    });
    return adjustedLines.join('\n');
  }
}
