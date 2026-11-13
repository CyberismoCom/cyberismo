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

  // In static mode an internal reference to the card's anchor; the PDF export
  // turns it into text when the card is not in the document.
  handleStatic = async (
    context: MacroGenerationContext,
    input: unknown,
  ): Promise<string> => {
    const options = this.validate(input);
    this.checkCard(options.cardKey, context);
    return `<<${options.cardKey}>>`;
  };

  // On the static site a native card xref, which the xref rewriter turns into
  // a card link, or into text when the card is not part of the export.
  handleStaticSite = async (
    context: MacroGenerationContext,
    input: unknown,
  ): Promise<string> => {
    const options = this.validate(input);
    this.checkCard(options.cardKey, context);
    return `xref:${options.cardKey}.adoc[]`;
  };

  private checkCard(cardKey: string, context: MacroGenerationContext) {
    const card = this.getCard(cardKey, context);
    if (!card || !card.metadata) {
      throw new Error(`Card key ${cardKey} not found`);
    }
  }

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
