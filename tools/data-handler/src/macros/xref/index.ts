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

import type { MacroOptions } from '../index.js';
import { validateMacroContent } from '../index.js';

import type { MacroGenerationContext } from '../../interfaces/macros.js';
import macroMetadata from './metadata.js';
import BaseMacro from '../base-macro.js';
import type TaskQueue from '../task-queue.js';
import type { Calculate } from '../../commands/index.js';

export interface XrefMacroOptions extends MacroOptions {
  cardKey: string;
}

export default class XrefMacro extends BaseMacro {
  constructor(
    tasksQueue: TaskQueue,
    private readonly calculate: Calculate,
  ) {
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
      metadata: true,
    });

    if (!card || !card.metadata) {
      throw new Error(`Card key ${options.cardKey} not found`);
    }

    // Generate AsciiDoc link with proper React Router URL
    return `link:/cards/${options.cardKey}[${card.metadata.title}]`;
  };

  handleInject = async (context: MacroGenerationContext, input: unknown) => {
    return this.handleStatic(context, input);
  };

  private validate(input: unknown): XrefMacroOptions {
    return validateMacroContent<XrefMacroOptions>(this.metadata, input);
  }
}
