// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Checkout } from '../../state/checkout/checkout.js';
import { assertAllowed } from './guard.js';
import { updateCardMetadata } from './update.js';
import { findCard } from './read.js';
import { DHValidationError } from '../../shared/exceptions/index.js';

/**
 * Performs a single workflow transition: writes the card's new state. The
 * transition's hooks are not run here.
 * Throws if the card is missing, the transition is not available from the
 * card's current state, or the transition is denied.
 *
 * Must run inside a write-lock context.
 */
export async function performTransition(
  checkout: Checkout,
  cardKey: string,
  transitionName: string,
): Promise<void> {
  const card = findCard(checkout, cardKey);

  if (!card.metadata?.cardType) {
    throw new Error(`Card does not have card type`);
  }
  // Card type
  const cardType = checkout.resources
    .byType(card.metadata?.cardType, 'cardTypes')
    .show();

  // Workflow
  const workflow = checkout.resources
    .byType(cardType.workflow, 'workflows')
    .show();

  const currentState = card.metadata.workflowState;

  // A transition is identified by its (unique) name and leads to a single
  // target state, though it may be available from several states or all
  // states ('*'). Find it by name, then check it can be made from the
  // card's current state.
  const byName = workflow.transitions.filter(
    (item) => item.name === transitionName,
  );
  if (byName.length === 0) {
    const transitionNames = workflow.transitions.map((item) => item.name);
    throw new DHValidationError(`Card's workflow '${cardType.workflow}' does not contain state transition '${transitionName}'.
                          \nThe available transitions are: ${transitionNames.join(', ')}`);
  }

  const found = byName.find(
    (item) =>
      item.fromState.includes(currentState) || item.fromState.includes('*'),
  );
  if (!found) {
    throw new DHValidationError(
      `Card's workflow '${cardType.workflow}' does not contain state transition from state '${currentState}' for '${transitionName}'`,
    );
  }

  await assertAllowed(checkout, 'transition', cardKey, transitionName);

  card.metadata.workflowState = found.toState;
  // lastUpdated is stamped by saveCardMetadata on every save; only
  // lastTransitioned needs to be set here.
  card.metadata.lastTransitioned = new Date().toISOString();
  await updateCardMetadata(checkout, card, card.metadata);
}
