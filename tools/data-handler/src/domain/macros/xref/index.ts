// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { validateMacroContent } from '../registry.js';

import type { MacroGenerationContext } from '../../../shared/interfaces/macros.js';
import macroMetadata from '@cyberismo/model/macros/xref/metadata';
import BaseMacro from '../base-macro.js';
import type TaskQueue from '../task-queue.js';
import type { XrefMacroOptions } from '@cyberismo/model';
import { cardNode } from '../../cards/read.js';

export default class XrefMacro extends BaseMacro {
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
    const card = this.getCard(options.cardKey, context);

    if (!card || !card.metadata) {
      throw new Error(`Card key ${options.cardKey} not found`);
    }

    // in static mode we need to use internal references
    return `<<${options.cardKey}>>`;
  };

  handleInject = async (context: MacroGenerationContext, input: unknown) => {
    const options = this.validate(input);
    const card = this.getCard(options.cardKey, context);
    return `link:/cards/${options.cardKey}[${card?.metadata?.title}]`;
  };

  private getCard(cardKey: string, context: MacroGenerationContext) {
    return cardNode(context.checkout, cardKey);
  }

  private validate(input: unknown): XrefMacroOptions {
    return validateMacroContent<XrefMacroOptions>(this.metadata, input);
  }
}
