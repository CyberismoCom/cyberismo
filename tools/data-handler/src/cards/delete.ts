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

import type { Card } from '@cyberismo/model';
import type { Checkout } from '../containers/project.js';
import { ActionGuard } from '../permissions/action-guard.js';
import { getChildLogger } from '../utils/log-utils.js';
import { updateCardMetadataKey } from './update.js';

const logger = getChildLogger({ module: 'Project' });

async function removeSubtree(
  checkout: Checkout,
  cardKey: string,
): Promise<void> {
  return checkout.treeOf(cardKey).deleteSubtree(cardKey);
}

/**
 * When cards are removed.
 * @param deletedCard Card that is to be removed.
 */
export async function handleCardDeleted(checkout: Checkout, deletedCard: Card) {
  // Delete children from the cache first
  if (deletedCard.children && deletedCard.children.length > 0) {
    for (const child of deletedCard.children) {
      try {
        const childCard = checkout.findCard(child);
        await handleCardDeleted(checkout, childCard);
      } catch (error) {
        logger.warn(
          { error },
          `Accessing child '${child}' of '${deletedCard.key}' when deleting cards caused an exception`,
        );
        continue;
      }
    }
  }
  await removeSubtree(checkout, deletedCard.key);
  return checkout.calculationEngine.handleDeleteCard(deletedCard);
}

/**
 * Deletes the given cards together with their descendant subtrees, and
 * removes any links from surviving cards that point at a deleted card.
 *
 * This is the structural card-deletion primitive shared by the `remove`
 * command and the resource mutation handlers. It performs no permission
 * checks and assumes the caller already holds the write lock.
 * @param cards Root cards to delete. Descendants are removed via cascade, so
 *   passing a card whose ancestor is also in the list is safe.
 */
export async function deleteCards(checkout: Checkout, cards: Card[]) {
  if (cards.length === 0) {
    return;
  }

  // Collect every key that will be removed (each card plus its subtree) so
  // link cleanup can drop links pointing anywhere into the deleted set.
  const deletedKeys = new Set<string>();
  const collectDescendants = (cardKey: string) => {
    if (deletedKeys.has(cardKey)) {
      return;
    }
    let card: Card;
    try {
      card = checkout.findCard(cardKey);
    } catch {
      logger.debug({ cardKey }, 'Card to delete not found, skipping');
      return;
    }
    deletedKeys.add(cardKey);
    for (const childKey of card.children) {
      collectDescendants(childKey);
    }
  };
  for (const card of cards) {
    collectDescendants(card.key);
  }

  // Strip links from surviving cards that point at any card being removed.
  const linkUpdates: Promise<void>[] = [];
  for (const item of checkout.cardTree.nodes()) {
    if (deletedKeys.has(item.key) || !item.metadata) {
      continue;
    }
    const links = item.metadata.links;
    const preservedLinks = links.filter((l) => !deletedKeys.has(l.cardKey));
    if (preservedLinks.length !== links.length) {
      linkUpdates.push(
        updateCardMetadataKey(checkout, item.key, 'links', preservedLinks),
      );
    }
  }
  await Promise.all(linkUpdates);

  // Remove the subtrees. handleCardDeleted cascades children, so any card
  // already removed as part of an earlier subtree is skipped here.
  for (const card of cards) {
    let fresh: Card;
    try {
      fresh = checkout.findCard(card.key);
    } catch {
      continue;
    }
    await handleCardDeleted(checkout, fresh);
  }
}

// Removes card from project or template
export async function removeCard(checkout: Checkout, cardKey: string) {
  const card = checkout.findCard(cardKey);

  // Imported templates cannot be modified.
  if (!checkout.treeOf(cardKey).writable) {
    throw new Error(`Cannot modify imported module`);
  }

  // Only a card in a workflow has a delete transition to permit.
  if (checkout.treeOf(cardKey).kind === 'project') {
    const actionGuard = new ActionGuard(checkout.calculationEngine);
    await actionGuard.checkPermission('delete', cardKey);
  }

  // Descendant cascade and link cleanup live in the project-level primitive.
  await deleteCards(checkout, [card]);
}
