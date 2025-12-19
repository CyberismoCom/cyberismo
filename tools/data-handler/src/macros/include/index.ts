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
      card.content,
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
      let content = await evaluateMacros(cardContent ?? '', context, true);
      if (options.escape === 'json') {
        content = escapeJsonString(content);
      } else if (options.escape === 'csv') {
        content = escapeCsvField(content);
      }
      return content;
    }
    return '';
  }

  private getCard(cardKey: string, context: MacroGenerationContext) {
    return context.project.findCard(cardKey);
  }

  // Adjust asciidoc titles to match the level offset
  private adjustTitles(
    content: string,
    levelOffset: number,
    discrete: boolean,
  ) {
    const lines = content.split('\n');
    const adjustedLines = lines.map((line) => {
      const match = line.match(/^(\s*)([=#]+)(.*?)\s*$/);
      if (match) {
        const currentLevel = match[2].length;
        const newLevel = Math.min(
          Math.max(1, currentLevel + levelOffset),
          MAX_LEVEL_OFFSET + 1,
        );
        const equals = '='.repeat(newLevel);
        return `${discrete ? '[discrete]\n' : ''}${match[1]}${equals} ${match[3].trim()}`;
      }
      return line;
    });
    return adjustedLines.join('\n');
  }
}
