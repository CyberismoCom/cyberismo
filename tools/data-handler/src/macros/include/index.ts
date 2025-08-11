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

import type { MacroGenerationContext } from '../../interfaces/macros.js';
import macroMetadata from './metadata.js';
import BaseMacro from '../base-macro.js';
import type TaskQueue from '../task-queue.js';
import { MAX_LEVEL_OFFSET } from '../../utils/constants.js';

export interface IncludeMacroOptions {
  cardKey: string;
  levelOffset?: string;
}

export default class IncludeMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (input: unknown) => {
    this.validate(input);
  };

  handleStatic = async (
    context: MacroGenerationContext,
    input: unknown,
  ): Promise<string> => {
    const options = this.validate(input);
    const card = await context.project.cardDetailsById(options.cardKey, {
      content: true,
      metadata: true,
    });
    if (!card) {
      throw new Error(`Card key ${options.cardKey} not found`);
    }
    const newContext = {
      ...context,
      cardKey: options.cardKey,
    };
    const content = `= ${card.metadata?.title}\n\n${await evaluateMacros(
      card.content ?? '',
      newContext,
    )}`;

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
      options.levelOffset
        ? Math.min(
            Math.max(parseInt(options.levelOffset, 10), -MAX_LEVEL_OFFSET),
            MAX_LEVEL_OFFSET,
          )
        : 0,
    );
    return adjustedContent;
  };

  handleInject = async (context: MacroGenerationContext, input: unknown) => {
    return this.handleStatic(context, input);
  };

  private validate(input: unknown): IncludeMacroOptions {
    return validateMacroContent<IncludeMacroOptions>(this.metadata, input);
  }

  // Adjust asciidoc titles to match the level offset
  private adjustTitles(content: string, levelOffset: number) {
    const lines = content.split('\n');
    const adjustedLines = lines.map((line) => {
      const match = line.match(/^(\s*)(=+)(.*?)\s*$/);
      if (match) {
        const currentLevel = match[2].length;
        const newLevel = Math.max(1, currentLevel + levelOffset);
        const equals = '='.repeat(newLevel);
        return `${match[1]}${equals} ${match[3].trim()}`;
      }
      return line;
    });
    return adjustedLines.join('\n');
  }
}
