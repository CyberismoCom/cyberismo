// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import {
  ClingoFactBuilder,
  encodeClingoValue,
} from '../../infra/engine/clingo-fact-builder.js';

/** A card an earlier program of the same action created. */
export interface CreatedCard {
  key: string;
  /** A card key, or 'root'. */
  parent: string;
  template: string;
  /** The create's Id, as text. */
  id: string;
  /** The template card the new card was copied from. */
  templateCard: string;
}

/** The text as an integer, if it is one written the canonical way. */
export function asInteger(text: string): number | undefined {
  const number = Number(text);
  return /^-?(0|[1-9][0-9]*)$/.test(text) && Number.isSafeInteger(number)
    ? number
    : undefined;
}

/** The text as a string literal. */
export const quoted = (text: string) => `"${encodeClingoValue(text)}"`;

/**
 * A create's Id as a term. Its text does not say what it was written as: it
 * becomes an integer or a constant when it reads as one, otherwise a string.
 * Card keys are constants, so an Id that is a card key matches one.
 */
export function term(text: string): string {
  return asInteger(text) !== undefined || /^[a-z_][A-Za-z0-9_']*$/.test(text)
    ? text
    : quoted(text);
}

/**
 * The facts every program of an action sees: actionCard/1, and created/5
 * for each card the action's earlier programs created.
 * @param cardKey The card the action runs on.
 * @param created Cards created by the action's earlier programs.
 */
export function actionFacts(cardKey: string, created: CreatedCard[]): string {
  const facts = [
    new ClingoFactBuilder('actionCard').addLiteralArgument(cardKey).build(),
  ];
  for (const card of created) {
    facts.push(
      new ClingoFactBuilder('created')
        .addLiteralArguments(card.key, card.parent)
        .addArgument(card.template)
        .addLiteralArguments(term(card.id), card.templateCard)
        .build(),
    );
  }
  return facts.join('\n');
}
