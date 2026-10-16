// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { createHtmlPlaceholder, validateMacroContent } from '../registry.js';

import type { CreateCardsOptions } from '@cyberismo/model';
import type { MacroGenerationContext } from '../../../shared/interfaces/macros.js';
import macroMetadata from '@cyberismo/model/macros/createCards/metadata';
import BaseMacro from '../base-macro.js';
import type TaskQueue from '../task-queue.js';

class CreateCardsMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (_: MacroGenerationContext, input: unknown) => {
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

  handleStaticSite = async () => {
    // export site does not support createCards
    return '';
  };

  private validate(input: unknown): CreateCardsOptions {
    return validateMacroContent<CreateCardsOptions>(this.metadata, input);
  }
}

export default CreateCardsMacro;
