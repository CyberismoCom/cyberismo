// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { assertAllowed } from './guard.js';
import {
  ContainerMismatchError,
  DHValidationError,
  ResourceNotFoundError,
} from '../../shared/exceptions/index.js';
import type { Checkout } from '../../state/checkout/checkout.js';
import type { CardTree } from '../../state/cards/card-tree.js';

import { ROOT } from '../../shared/utils/constants.js';
import { checkPosition } from '../../shared/utils/validate.js';
import { cardNode } from './read.js';

interface MoveTarget {
  /** Tree the card is in now. */
  sourceTree: CardTree;
  /** Tree the card goes to. */
  targetTree: CardTree;
  /** New parent card key, or 'root'. */
  newParent: string;
}

// Where moving `source` to `destination` puts it.
// @throws if the card cannot be moved there.
function moveTarget(
  checkout: Checkout,
  source: string,
  destination: string,
): MoveTarget {
  if (source === ROOT) {
    throw new DHValidationError('Cannot move "root"');
  }
  if (source === destination) {
    throw new DHValidationError(`Card cannot be moved to itself`);
  }

  const sourceTree = checkout.treeOf(source);
  const sourceIsTemplate = sourceTree.name !== 'project';

  const movingToRoot = destination === ROOT || destination.startsWith('root:');
  let targetTemplateName: string | undefined;
  let movingToProjectRoot = false;

  if (movingToRoot) {
    if (destination === ROOT) {
      // Bare 'root' means the root of the card's own container.
      if (sourceIsTemplate) {
        targetTemplateName = sourceTree.name;
      } else {
        movingToProjectRoot = true;
      }
    } else if (destination === 'root:project') {
      movingToProjectRoot = true;
    } else {
      targetTemplateName = destination.slice('root:'.length);
    }
  }

  const destinationTree = movingToRoot
    ? undefined
    : checkout.treeOf(destination);

  // Resolve the target template (when moving to a template root).
  let targetTemplateTree: CardTree | undefined;
  if (targetTemplateName) {
    const template = checkout.templateResource(targetTemplateName);
    if (!template) {
      throw new ResourceNotFoundError(
        targetTemplateName,
        `Template ${targetTemplateName} not found in this project`,
      );
    }
    targetTemplateTree = template.cardTree;
  }

  const destIsProject =
    movingToProjectRoot ||
    (destinationTree !== undefined && destinationTree.kind === 'project');
  const destIsTemplate =
    targetTemplateName !== undefined ||
    (destinationTree !== undefined && destinationTree.kind !== 'project');
  if (
    (sourceIsTemplate && destIsProject) ||
    (!sourceIsTemplate && destIsTemplate)
  ) {
    throw new ContainerMismatchError(
      `Cards cannot be moved from project to template or vice versa`,
    );
  }

  const targetTree = targetTemplateTree ?? destinationTree ?? checkout.cardTree;
  const newParent = movingToRoot ? ROOT : destination;

  return { sourceTree, targetTree, newParent };
}

// Whether the move leaves the card under the parent it has.
function staysUnderParent(
  { sourceTree, targetTree, newParent }: MoveTarget,
  source: string,
): boolean {
  return (
    sourceTree === targetTree && sourceTree.card(source).parent === newParent
  );
}

/**
 * Moves a card under a parent, optionally to a position among its new
 * siblings. A move to the card's own parent only ranks it. The position is
 * checked before anything is written.
 * @param source Card to move.
 * @param destination New parent card; 'root' for the root of the card's
 *   own container, or 'root:project' / 'root:<template>'.
 * @param index Position among the destination's cards as they are now; 0 is
 *   first. A card staying under its parent counts itself among them.
 * @returns Whether the card moved to another parent.
 * @throws DHValidationError if the position is not a whole number, is
 *   negative or is past the end.
 */
export async function moveCard(
  checkout: Checkout,
  source: string,
  destination: string,
  index?: number,
): Promise<boolean> {
  const target = moveTarget(checkout, source, destination);
  const { targetTree, newParent } = target;
  const staying = staysUnderParent(target, source);
  const step =
    index === undefined
      ? undefined
      : rankStep(targetTree.childrenInRankOrder(newParent), source, index);
  if (!staying) {
    await assertAllowed(checkout, 'move', source);
    await relocateCard(checkout, source, newParent, targetTree.name);
    await checkout.handleCardMoved(cardNode(checkout, source));
  }
  if (step) {
    await takeRankStep(checkout, source, step);
  }
  return !staying;
}

// What ranking a card at a position takes: ranking it first, after a
// sibling, or nothing when it already sits there.
type RankStep = { first: true } | { after: string } | { stay: true };

// What putting `cardKey` at `index` among `cards` takes. `cards` are the
// cards under the destination parent as they are now, in rank order; the
// card is one of them when it stays under its parent, and the position right
// after it leaves it where it is.
// @throws DHValidationError if the index is not a whole number, is negative
//   or is past the end
function rankStep(cards: string[], cardKey: string, index: number): RankStep {
  checkPosition(index, cards.length);
  if (index === 0) {
    return { first: true };
  }
  const previous = cards[index - 1];
  return previous === cardKey ? { stay: true } : { after: previous };
}

async function takeRankStep(
  checkout: Checkout,
  cardKey: string,
  step: RankStep,
) {
  if ('first' in step) {
    await rankFirst(checkout, cardKey);
  } else if ('after' in step) {
    await rankAfter(checkout, cardKey, step.after);
  }
}

/**
 * Ranks a card at a position among its siblings.
 * @param cardKey card key
 * @param index Position among the siblings as they are now, the card itself
 *   included; 0 is first, and the position right after the card leaves it
 *   where it is.
 * @throws DHValidationError if the position is not a whole number, is
 *   negative or is past the end.
 */
export async function rankAt(
  checkout: Checkout,
  cardKey: string,
  index: number,
) {
  const siblings = checkout.treeOf(cardKey).siblingsOf(cardKey);
  await takeRankStep(checkout, cardKey, rankStep(siblings, cardKey, index));
}

/**
 * Sets the rank of a card to be after another card.
 * @param cardKey Card to rank
 * @param beforeCardKey Card key after which the card will be ranked
 */
export async function rankAfter(
  checkout: Checkout,
  cardKey: string,
  beforeCardKey: string,
) {
  if (cardKey === beforeCardKey) {
    throw new DHValidationError(`Card cannot be ranked after itself`);
  }

  const tree = checkout.treeOf(cardKey);
  // Same tree and same parent: a rank only orders siblings, and two cards
  // in different containers are never siblings even when both sit at 'root'.
  if (
    tree !== checkout.treeOf(beforeCardKey) ||
    tree.node(beforeCardKey).parent !== tree.node(cardKey).parent
  ) {
    throw new DHValidationError(`Cards must be from the same parent`);
  }

  await tree.reorderAfter(cardKey, beforeCardKey);
}

/**
 * Ranks card first.
 * @param cardKey card key
 */
export async function rankFirst(checkout: Checkout, cardKey: string) {
  await checkout.treeOf(cardKey).reorderFirst(cardKey);
}

/**
 *  Rebalances the ranks of the children of a card.
 * @param parentCardKey parent card key
 */
export async function rebalanceUnder(
  checkout: Checkout,
  parentCardKey: string,
) {
  await checkout.treeOf(parentCardKey).rebalanceChildren(parentCardKey);
}

/**
 * Rebalances the ranks of the cards in the whole project, including templates
 * Can be used even if the ranks do not exist
 */
export async function rebalanceAll(checkout: Checkout) {
  for (const tree of [checkout.cardTree, ...checkout.templateTrees()]) {
    if (tree.writable) {
      await tree.rebalanceAll();
    }
  }
}

/**
 * Moves a card to a new position in the card tree.
 * @param container Container the card now belongs to: 'project' or a full
 *   template name. Defaults to the one it is in.
 */
async function relocateCard(
  checkout: Checkout,
  cardKey: string,
  newParent: string,
  container?: string,
) {
  const source = checkout.treeOf(cardKey);
  const destination =
    container === undefined ? source : checkout.containerTree(container);
  if (destination === source) {
    await source.relocate(cardKey, newParent);
    return;
  }
  await destination.adopt(source, cardKey, newParent);
}
