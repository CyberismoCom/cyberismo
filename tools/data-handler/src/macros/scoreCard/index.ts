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

import type { MacroOptions } from '../index.js';
import { createImage, validateMacroContent } from '../index.js';

import type { MacroGenerationContext } from '../../interfaces/macros.js';
import macroMetadata from './metadata.js';
import BaseMacro from '../base-macro.js';
import type TaskQueue from '../task-queue.js';
import { scoreCard } from '../../svg/index.js';

export interface ScoreCardOptions extends MacroOptions {
  value: number;
  legend?: string;
  title?: string;
  unit?: string;
}

class ScoreCardMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }
  handleValidate = (data: string) => {
    this.validate(data);
  };

  handleStatic = async (_: MacroGenerationContext, input: unknown) => {
    const options = this.validate(input);
    return createImage(
      Buffer.from(scoreCard(options)).toString('base64'),
      false,
    );
  };

  handleInject = async (context: MacroGenerationContext, input: unknown) => {
    return this.handleStatic(context, input);
  };

  private validate(input: unknown): ScoreCardOptions {
    return validateMacroContent<ScoreCardOptions>(this.metadata, input);
  }
}

export default ScoreCardMacro;
