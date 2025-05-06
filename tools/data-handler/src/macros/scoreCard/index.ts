/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { createHtmlPlaceholder, validateMacroContent } from '../index.js';
import BaseMacro from '../base-macro.js';
import macroMetadata from './metadata.js';

import type { MacroGenerationContext } from '../../interfaces/macros.js';
import type TaskQueue from '../task-queue.js';

export interface ScoreCardOptions {
  title?: string;
  value: number;
  unit?: string;
  legend?: string;
  [key: string]: string | number | undefined;
}

class ScoreCardMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }
  handleValidate = (data: string) => {
    this.validate(data);
  };

  handleStatic = async (context: MacroGenerationContext, input: unknown) => {
    const options = this.validate(input);
    return this.createAsciidocElement(options);
  };

  handleInject = async (_: MacroGenerationContext, input: unknown) => {
    const options = this.validate(input);
    return createHtmlPlaceholder(this.metadata, options);
  };

  private validate(input: unknown): ScoreCardOptions {
    return validateMacroContent<ScoreCardOptions>(this.metadata, input);
  }

  private createAsciidocElement(options: ScoreCardOptions) {
    return `\n----\n${options.title}: ${options.value} ${options.unit ?? ''} ${options.legend ?? ''}\n----\n`;
  }
}

export default ScoreCardMacro;
