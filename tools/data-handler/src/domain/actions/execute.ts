// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ActionResult } from '@cyberismo/model';
import {
  LogicError,
  LogicInternalError,
} from '../../infra/logic/logic-backend.js';
import {
  ActionFailedError,
  DHValidationError,
} from '../../shared/exceptions/index.js';
import type { Checkout } from '../../state/checkout/checkout.js';
import { findCard } from '../cards/read.js';
import type { CheckedEffect } from './effects/define.js';
import { EFFECTS } from './effects/index.js';
import { actionFacts, type CreatedCard } from './facts.js';
import { solveEffects } from './rows.js';
import { applyEffects, checkEffects, EffectFailed } from './run.js';

// A failure's text: a logic error's error messages, or the message. An
// internal logic error's diagnostics are about the project's programs, not
// the action's, so only its message is given.
function causeText(cause: unknown): string {
  const text =
    cause instanceof LogicError && !(cause instanceof LogicInternalError)
      ? cause.errors.join('; ')
      : cause instanceof Error
        ? cause.message
        : String(cause);
  return text.replace(/\.+$/, '');
}

/**
 * The error of an action that failed in a program, at an effect if one
 * failed. A failure after the first program says that, without autocommit,
 * the changes of the programs before it were kept; with autocommit the
 * failed write is rolled back.
 * @param program The failing program, from 1.
 * @param effect The failing effect's atom, if an effect failed.
 * @param cause What failed.
 */
export function actionFailed(
  program: number,
  effect: string | undefined,
  cause: unknown,
): ActionFailedError {
  const kept =
    program > 1
      ? ' Without autocommit, the changes of the earlier programs were kept.'
      : '';
  return new ActionFailedError(
    `Action failed in program ${program}${effect ? ` at ${effect}` : ''}: ${causeText(cause)}.${kept}`,
    program,
    effect,
    cause,
  );
}

// Solves one program and checks its effects. The first refusal, in the
// order of the atoms, refuses the program.
async function effectsOf(
  checkout: Checkout,
  cardKey: string,
  created: CreatedCard[],
  program: string,
): Promise<CheckedEffect[]> {
  const pending = await solveEffects(
    checkout,
    `${actionFacts(cardKey, created)}\n${program}`,
    EFFECTS,
    true,
  );
  const { checked, refused } = checkEffects(checkout, pending);
  if (refused.length > 0) {
    const [{ atom, reason }] = refused;
    throw new DHValidationError(`Cannot apply '${atom}': ${reason}`);
  }
  return checked;
}

/**
 * Runs an action's programs on a card, in order. Each program is solved,
 * checked and applied before the next is solved; programs after the first
 * see the cards created before them as created/5 facts. Runs inside a write.
 *
 * A check refusal or logic error in the first program propagates as is, with
 * nothing written. Any other failure is an ActionFailedError.
 * @param checkout The checkout to change.
 * @param cardKey The card the action runs on; actionCard/1 in every program.
 * @param programs The action's logic programs.
 * @throws CardNotFoundError if the card does not exist
 */
export async function runAction(
  checkout: Checkout,
  cardKey: string,
  programs: string[],
): Promise<ActionResult> {
  findCard(checkout, cardKey);
  if (programs.length === 0) {
    throw new DHValidationError('An action needs at least one program');
  }
  const created: CreatedCard[] = [];
  for (const [index, program] of programs.entries()) {
    const n = index + 1;
    let effects: CheckedEffect[];
    try {
      effects = await effectsOf(checkout, cardKey, created, program);
    } catch (error) {
      if (n === 1) throw error;
      throw actionFailed(n, undefined, error);
    }
    try {
      created.push(...(await applyEffects(checkout, effects)));
    } catch (error) {
      throw error instanceof EffectFailed
        ? actionFailed(n, error.atom, error.cause)
        : actionFailed(n, undefined, error);
    }
  }
  return {
    created: created.map(({ key }) => ({
      key,
      title: findCard(checkout, key).metadata?.title ?? '',
    })),
  };
}
