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

import { runWithDefaultCommitMessage } from '../../infra/tx/commit-context.js';
import { ROOT } from '../../shared/utils/constants.js';
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
 * Moves card from 'destination' to 'source'.
 * @param source source card to move
 * @param destination destination card where source card will be moved to; or to root
 */
export async function moveCard(
  checkout: Checkout,
  source: string,
  destination: string,
) {
  const target = moveTarget(checkout, source, destination);
  const { targetTree, newParent } = target;

  // if the card is already in the destination, do nothing
  if (staysUnderParent(target, source)) {
    return;
  }

  // make sure source card can be moved
  await assertAllowed(checkout, 'move', source);

  await relocateCard(checkout, source, newParent, targetTree.name);

  await checkout.handleCardMoved(cardNode(checkout, source));
}

/**
 * Moves a card under a parent, optionally to a position among its new
 * siblings, as one write. A move to the card's own parent only ranks it.
 * The position is checked before the card moves.
 * @param source Card to move.
 * @param destination New parent card; 'root' for the root of the card's
 *   own container, or 'root:project' / 'root:<template>'.
 * @param index Position among the new siblings; 0 is first.
 * @throws DHValidationError if the position is negative or past the end.
 */
export async function moveCardTo(
  checkout: Checkout,
  source: string,
  destination: string,
  index?: number,
) {
  const target = moveTarget(checkout, source, destination);
  const staying = staysUnderParent(target, source);
  if (index !== undefined) {
    assertIndex(index);
    const others = target.targetTree
      .childrenOf(target.newParent)
      .filter((key) => key !== source).length;
    // A card staying where it is can also go after itself.
    if (index > (staying ? others + 1 : others)) {
      throw new DHValidationError(`Index ${index} is out of bounds`);
    }
  }
  const message = staying
    ? `Rank card ${source}`
    : `Move card ${source} to ${destination}`;
  await runWithDefaultCommitMessage(message, () =>
    checkout.lock.write(async () => {
      await moveCard(checkout, source, destination);
      if (index !== undefined) {
        await rankAt(checkout, source, index);
      }
    }),
  );
}

function assertIndex(index: number) {
  if (index < 0) {
    throw new DHValidationError(`Index must not be negative`);
  }
}

/**
 * Ranks card using position given as 'index'.
 * @param cardKey card key
 * @param index to which position should card be ranked to
 */
export async function rankAt(
  checkout: Checkout,
  cardKey: string,
  index: number,
) {
  assertIndex(index);
  if (index === 0) {
    await rankFirst(checkout, cardKey);
    return;
  }

  const siblings = checkout.treeOf(cardKey).siblingsOf(cardKey);
  if (siblings.length < index) {
    throw new DHValidationError(`Index ${index} is out of bounds`);
  }
  await rankAfter(checkout, cardKey, siblings[index - 1]);
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
