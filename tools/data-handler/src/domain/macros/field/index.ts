// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { createHtmlPlaceholder, validateMacroContent } from '../registry.js';

import type { MacroGenerationContext } from '../../../shared/interfaces/macros.js';
import macroMetadata from '@cyberismo/model/macros/field/metadata';
import type { FieldMacroOptions } from '@cyberismo/model';
import BaseMacro from '../base-macro.js';
import type TaskQueue from '../task-queue.js';
import { cardNode } from '../../cards/read.js';
import { fieldStaticText, literal } from './text.js';

const BUILT_IN_LABELS = new Map([
  ['title', 'Title'],
  ['workflowState', 'Workflow state'],
]);

interface ResolvedField {
  cardKey: string;
  field: string;
  showLabel: boolean;
}

export default class FieldMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (_: MacroGenerationContext, input: unknown) => {
    validateMacroContent<FieldMacroOptions>(this.metadata, input);
  };

  handleInject = async (context: MacroGenerationContext, input: unknown) =>
    createHtmlPlaceholder(this.metadata, this.resolve(context, input));

  handleStatic = async (
    context: MacroGenerationContext,
    input: unknown,
  ): Promise<string> => {
    const { cardKey, field, showLabel } = this.resolve(context, input);
    const [card] = await cardQuery(context, cardKey);
    if (!card) {
      throw new Error(`Card '${cardKey}' not found`);
    }
    const builtIn = BUILT_IN_LABELS.get(field);
    if (builtIn) {
      const value = field === 'title' ? card.title : card.workflowState;
      return fieldStaticText(
        { dataType: 'shortText', value },
        builtIn,
        showLabel,
      );
    }
    const row = card.fields.find((item) => item.key === field);
    if (!row) {
      throw new Error(`no value for field '${field}'`);
    }
    return fieldStaticText(row, row.fieldDisplayName || field, showLabel);
  };

  // Without this the static site would fall back to the inject placeholder
  handleStaticSite = this.handleStatic;

  // Checks the card exists before its key reaches any logic program.
  private resolve(
    context: MacroGenerationContext,
    input: unknown,
  ): ResolvedField {
    const { field, showLabel = true } = validateMacroContent<FieldMacroOptions>(
      this.metadata,
      input,
    );
    const { checkout, cardKey } = context;
    const card = cardNode(checkout, cardKey);
    if (!BUILT_IN_LABELS.has(field)) {
      if (!field.includes('/fieldTypes/')) {
        throw new Error(
          `use the full field name \`<module>/fieldTypes/${literal(field)}\``,
        );
      }
      try {
        checkout.resources.byType(field, 'fieldTypes').show();
      } catch {
        throw new Error(`unknown field '${literal(field)}'`);
      }
      const cardType = card.metadata?.cardType;
      if (!cardType) {
        throw new Error(`Card type not found for card ${cardKey}`);
      }
      const { customFields } = checkout.resources
        .byType(cardType, 'cardTypes')
        .show();
      if (!customFields.some((item) => item.name === field)) {
        throw new Error(
          `field '${field}' is not a field of card type '${cardType}'`,
        );
      }
    }
    return { cardKey, field, showLabel };
  }
}

// One card query per card key within an evaluation.
function cardQuery(context: MacroGenerationContext, cardKey: string) {
  let result = context.cardQueries?.get(cardKey);
  if (!result) {
    result = context.checkout.calculationEngine.runQuery(
      'card',
      context.context,
      { cardKey },
    );
    context.cardQueries?.set(cardKey, result);
  }
  return result;
}
