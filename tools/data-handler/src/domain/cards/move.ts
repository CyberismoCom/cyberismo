/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { assertAllowed } from './guard.js';
import { ContainerMismatchError } from '../../shared/exceptions/index.js';
import type { Checkout } from '../../infra/checkout.js';
import type { CardTree } from '../../infra/card-tree.js';

import { ROOT } from '../../shared/utils/constants.js';
import { cardNode } from './read.js';

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
  if (source === ROOT) {
    throw new Error('Cannot move "root"');
  }
  if (source === destination) {
    throw new Error(`Card cannot be moved to itself`);
  }

  const sourceTree = checkout.treeOf(source);
  const sourceCard = sourceTree.card(source);
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
      throw new Error(
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

  // if the card is already in the destination, do nothing
  if (sourceTree === targetTree && sourceCard.parent === newParent) {
    return;
  }

  // make sure source card can be moved
  await assertAllowed(checkout, 'move', source);

  await relocateCard(checkout, source, newParent, targetTree.name);

  await checkout.handleCardMoved(cardNode(checkout, source));
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
  if (index < 0) {
    throw new Error(`Index must be greater than 0`);
  }
  if (index === 0) {
    await rankFirst(checkout, cardKey);
    return;
  }

  const siblings = checkout.treeOf(cardKey).siblingsOf(cardKey);
  if (siblings.length < index) {
    throw new Error(`Index ${index} is out of bounds`);
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
    throw new Error(`Card cannot be ranked after itself`);
  }

  const tree = checkout.treeOf(cardKey);
  // Same tree and same parent: a rank only orders siblings, and two cards
  // in different containers are never siblings even when both sit at 'root'.
  if (
    tree !== checkout.treeOf(beforeCardKey) ||
    tree.node(beforeCardKey).parent !== tree.node(cardKey).parent
  ) {
    throw new Error(`Cards must be from the same parent`);
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
