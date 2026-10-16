// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Checkout } from '../../state/checkout/checkout.js';
import { assertAllowed } from './guard.js';
import { applySideEffects, type SideEffects } from './side-effects.js';
import { getChildLogger } from '../../shared/utils/log-utils.js';
import { updateCardMetadata } from './update.js';
import { findCard } from './read.js';

const logger = getChildLogger({ module: 'Project' });

// Wrapper to run onTransition query.
async function transitionChangesQuery(
  checkout: Checkout,
  cardKey: string,
  transition: string,
) {
  if (!cardKey || !transition) return undefined;
  return checkout.calculationEngine.runQuery('onTransition', 'localApp', {
    cardKey,
    transition,
  });
}

/**
 * Performs a single workflow transition without cascading, and returns
 * its side effects for the caller to execute. Throws if the card is
 * missing, the transition is not available from the card's current state,
 * or the transition is denied.
 *
 * Must run inside a write-lock context (the transition command, or the
 * creation flow's side-effect execution).
 */
export async function performTransition(
  checkout: Checkout,
  cardKey: string,
  transitionName: string,
): Promise<SideEffects | undefined> {
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
    throw new Error(`Card's workflow '${cardType.workflow}' does not contain state transition '${transitionName}'.
                          \nThe available transitions are: ${transitionNames.join(', ')}`);
  }

  const found = byName.find(
    (item) =>
      item.fromState.includes(currentState) || item.fromState.includes('*'),
  );
  if (!found) {
    throw new Error(
      `Card's workflow '${cardType.workflow}' does not contain state transition from state '${currentState}' for '${transitionName}'`,
    );
  }

  await assertAllowed(checkout, 'transition', cardKey, transitionName);

  card.metadata.workflowState = found.toState;
  // lastUpdated is stamped by saveCardMetadata on every save; only
  // lastTransitioned needs to be set here.
  card.metadata.lastTransitioned = new Date().toISOString();
  await updateCardMetadata(checkout, card, card.metadata);

  // A broken module calculation must not fail the transition itself.
  try {
    const queryResult = await transitionChangesQuery(
      checkout,
      cardKey,
      transitionName,
    );
    return queryResult?.at(0);
  } catch (error) {
    logger.warn(
      {
        cardKey,
        transition: transitionName,
        error: error instanceof Error ? error.message : String(error),
      },
      'onTransition query failed; side effects skipped',
    );
    return undefined;
  }
}

/**
 * Executes a transition's side effects (field updates and cascading
 * transitions on other cards). Never throws: module calculation problems
 * must not fail the user's primary action.
 * @param effects Side effects from an onTransition/onCreation query.
 * @param visited `cardKey:transitionName` pairs already attempted in this
 *                cascade.
 */
export async function executeSideEffects(
  checkout: Checkout,
  effects: SideEffects | undefined,
  visited: Set<string>,
): Promise<void> {
  try {
    await applySideEffects(checkout, effects, visited, (card, name) =>
      performTransition(checkout, card, name),
    );
  } catch (error) {
    logger.warn(
      {
        attempted: [...visited],
        error: error instanceof Error ? error.message : String(error),
      },
      'Applying transition side effects failed',
    );
  }
}

/**
 * Runs the creation query for cards that were just added, and executes the
 * side effects it asks for.
 *
 * Must run inside a write-lock context, after the cards were created: the
 * query only sees them once their facts have been projected.
 * @param cardKeys Keys of the cards that were created.
 */
export async function runCreationSideEffects(
  checkout: Checkout,
  cardKeys: string[],
) {
  const queryResult = await checkout.calculationEngine.creationQuery(
    cardKeys,
    'localApp',
  );
  await executeSideEffects(
    checkout,
    queryResult?.at(0),
    // Empty seed: the created cards' initial "Create" transitions already
    // happened during creation itself; a re-entrant "Create" side effect
    // would be rejected anyway by the fromState check, so nothing needs
    // to be pre-marked visited here.
    new Set<string>(),
  );
}

/**
 * Transitions a card from its current state to a new state, then executes
 * any side effects modules have declared for the transition.
 * @param cardKey card key
 * @param transitionName name of the transition to do
 */
export async function transitionCard(
  checkout: Checkout,
  cardKey: string,
  transitionName: string,
) {
  const effects = await performTransition(checkout, cardKey, transitionName);
  await executeSideEffects(
    checkout,
    effects,
    new Set([`${cardKey}:${transitionName}`]),
  );
}
