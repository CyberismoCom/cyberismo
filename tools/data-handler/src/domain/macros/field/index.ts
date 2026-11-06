// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import {
  createHtmlPlaceholder,
  createInlineHtmlPlaceholder,
  validateMacroContent,
} from '../registry.js';

import type { MacroGenerationContext } from '../../../shared/interfaces/macros.js';
import macroMetadata from '@cyberismo/model/macros/field/metadata';
import {
  FIELD_MACRO_DEFAULT_DISPLAY,
  fieldMacroDefaultShowLabel,
} from '@cyberismo/model';
import type { FieldMacroOptions, QueryResult } from '@cyberismo/model';
import BaseMacro from '../base-macro.js';
import type TaskQueue from '../task-queue.js';
import { isEmptyFieldValue } from '../../../shared/utils/constants.js';
import { cardNode } from '../../cards/read.js';
import { formatValue } from '../../queries/handlebars-helpers.js';

type Display = NonNullable<FieldMacroOptions['display']>;

type CardQueryField = QueryResult<'card'>['fields'][number];

/** The part of a card query field row that the static text reads. */
export type FieldValueRow = Pick<CardQueryField, 'dataType' | 'value'>;

const EMPTY = '—';

// Everything outside letters, digits and spaces becomes a numeric entity, so
// no AsciiDoc or macro syntax survives. A character missing from the allowlist
// only costs a needless entity, so punctuation is not added to it. Numeric,
// because asciidoctor-pdf rejects named entities beyond amp, apos, gt, lt,
// nbsp and quot.
const encode = (line: string) =>
  line.replace(/[^\p{L}\p{N} ]/gu, (c) => `&#${c.codePointAt(0)};`);

// Each line is its own passthrough, so a line cannot start a block, comment or
// heading; ` +` keeps the line breaks.
const literal = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => `pass:[${encode(line)}]`)
    .join(' +\n');

/**
 * AsciiDoc text that shows a field value exactly as typed.
 * @param row Card query field row; built-ins pass their value as shortText
 * @param label Label shown before the value
 * @param showLabel Whether to show the label
 * @param display A row is a block of its own, like its placeholder in the
 * application; inline stays within its line
 */
export function fieldStaticText(
  { value }: FieldValueRow,
  label: string,
  showLabel: boolean,
  display: Display,
): string {
  const shown =
    isEmptyFieldValue(value) || (Array.isArray(value) && !value.length)
      ? EMPTY
      : formatValue(value);
  const text = showLabel
    ? `pass:[<strong>${encode(label)}</strong>]: ${literal(shown)}`
    : literal(shown);
  return display === 'row' ? `\n\n${text}\n\n` : text;
}

const BUILT_IN_LABELS = new Map([
  ['title', 'Title'],
  ['workflowState', 'Workflow state'],
]);

interface ResolvedField {
  cardKey: string;
  field: string;
  showLabel: boolean;
  display: NonNullable<FieldMacroOptions['display']>;
}

export default class FieldMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (_: MacroGenerationContext, input: unknown) => {
    validateMacroContent<FieldMacroOptions>(this.metadata, input);
  };

  handleInject = async (context: MacroGenerationContext, input: unknown) => {
    const options = this.resolve(context, input);
    return options.display === 'inline'
      ? createInlineHtmlPlaceholder(this.metadata, options)
      : createHtmlPlaceholder(this.metadata, options);
  };

  handleStatic = async (
    context: MacroGenerationContext,
    input: unknown,
  ): Promise<string> => {
    const { cardKey, field, showLabel, display } = this.resolve(context, input);
    const [card] = await cardQuery(context, cardKey);
    const builtIn = BUILT_IN_LABELS.get(field);
    if (builtIn) {
      const value = field === 'title' ? card.title : card.workflowState;
      return fieldStaticText(
        { dataType: 'shortText', value },
        builtIn,
        showLabel,
        display,
      );
    }
    const row = card.fields.find((item) => item.key === field)!;
    return fieldStaticText(
      row,
      row.fieldDisplayName || field,
      showLabel,
      display,
    );
  };

  // Without this the static site would fall back to the inject placeholder
  handleStaticSite = this.handleStatic;

  // Checks the target card exists before its key reaches any logic program.
  private resolve(
    context: MacroGenerationContext,
    input: unknown,
  ): ResolvedField {
    const {
      cardKey = context.cardKey,
      field,
      display = FIELD_MACRO_DEFAULT_DISPLAY,
      showLabel = fieldMacroDefaultShowLabel(display),
    } = validateMacroContent<FieldMacroOptions>(this.metadata, input);
    const { checkout } = context;
    const card = existingCard(checkout, cardKey);
    // Instantiation does not rewrite the key, so it would keep pointing at the template.
    // A host that is no card, such as the PDF report's top level, has no such risk.
    const host = checkout.keyRegistry.ownerOf(context.cardKey);
    if (
      checkout.treeOf(cardKey).kind !== 'project' &&
      host?.kind === 'project'
    ) {
      throw new Error('a field macro cannot target a template card');
    }
    if (!BUILT_IN_LABELS.has(field)) {
      if (!field.includes('/fieldTypes/')) {
        throw new Error(
          `use the full field name \`<module>/fieldTypes/${field}\``,
        );
      }
      try {
        checkout.resources.byType(field, 'fieldTypes').show();
      } catch {
        throw new Error(`unknown field '${field}'`);
      }
      const { cardType } = card.metadata!;
      const { customFields } = checkout.resources
        .byType(cardType, 'cardTypes')
        .show();
      if (!customFields.some((item) => item.name === field)) {
        throw new Error(
          `field '${field}' is not a field of card type '${cardType}'`,
        );
      }
    }
    return { cardKey, field, showLabel, display };
  }
}

// One message for any failed lookup; the key is echoed literally.
function existingCard(
  checkout: MacroGenerationContext['checkout'],
  cardKey: string,
) {
  try {
    return cardNode(checkout, cardKey);
  } catch {
    throw new Error(`card '${cardKey}' does not exist`);
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
