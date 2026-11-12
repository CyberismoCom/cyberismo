// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { createHtmlPlaceholder, validateMacroContent } from '../registry.js';

import type { CreateLinksOptions } from '@cyberismo/model';
import type { MacroGenerationContext } from '../../../shared/interfaces/macros.js';
import macroMetadata from '@cyberismo/model/macros/createLinks/metadata';
import BaseMacro from '../base-macro.js';
import type TaskQueue from '../task-queue.js';
import { getLinkTypeWithValidation } from '../../cards/update.js';

class CreateLinksMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (context: MacroGenerationContext, input: unknown) => {
    this.validate(context, input);
  };

  async handleStatic() {
    // Buttons aren't supported in static mode
    return '';
  }

  handleInject = async (context: MacroGenerationContext, input: unknown) => {
    const options = this.validate(context, input);
    return createHtmlPlaceholder(this.metadata, options);
  };

  handleStaticSite = async () => {
    // export site does not support createLinks
    return '';
  };

  private validate(
    context: MacroGenerationContext,
    input: unknown,
  ): CreateLinksOptions {
    const options = validateMacroContent<CreateLinksOptions>(
      this.metadata,
      input,
    );
    // An empty description means none
    if (options.linkDescription === '') {
      delete options.linkDescription;
    }
    getLinkTypeWithValidation(
      context.checkout,
      options.linkType,
      options.linkDescription,
    );
    return options;
  }
}

export default CreateLinksMacro;
