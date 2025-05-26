/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { MacroOptions } from '../index.js';
import { createHtmlPlaceholder, validateMacroContent } from '../index.js';

import type { MacroGenerationContext } from '../../interfaces/macros.js';
import macroMetadata from './metadata.js';
import BaseMacro from '../base-macro.js';
import type TaskQueue from '../task-queue.js';

export interface CreateCardsOptions extends MacroOptions {
  buttonLabel: string;
  template: string;
  cardKey?: string;
  link?: {
    linkType: string;
    direction: string;
    cardKey: string;
  };
  [key: string]: string | undefined | { [key: string]: string | undefined };
}

class CreateCardsMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (input: unknown) => {
    this.validate(input);
  };

  async handleStatic() {
    // Buttons aren't supported in static mode
    return '';
  }

  handleInject = async (_: MacroGenerationContext, input: unknown) => {
    const options = this.validate(input);
    return createHtmlPlaceholder(this.metadata, options);
  };

  private validate(input: unknown): CreateCardsOptions {
    return validateMacroContent<CreateCardsOptions>(this.metadata, input);
  }
}

export default CreateCardsMacro;
