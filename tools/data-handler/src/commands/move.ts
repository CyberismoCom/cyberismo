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

// node
import { join } from 'node:path';

import { ActionGuard } from '../permissions/action-guard.js';
import { copyDir, deleteDir } from '../utils/file-utils.js';
import type { Card } from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';
import { write } from '../utils/rw-lock.js';
import {
  EMPTY_RANK,
  FIRST_RANK,
  getRankAfter,
  getRankBetween,
  rebalanceRanks,
  sortItems,
} from '../utils/lexorank.js';
import {
  cardPathParts,
  isModuleCard,
  isTemplateCard,
} from '../utils/card-utils.js';

import { ROOT } from '../utils/constants.js';

export class Move {
  constructor(private project: Project) {}

  // Returns children of a parent card or root cards
  private getSiblings(card: Card): Card[] {
    const parentCardKey = card.parent || ROOT;

    // since we don't know if 'root' is templateRoot or cardRoot, we need to check the card
    if (parentCardKey === ROOT) {
      if (isTemplateCard(card)) {
        if (isModuleCard(card)) {
          throw new Error(`Cannot rank module cards`);
        }
        const { template } = cardPathParts(
          this.project.projectPrefix,
          card.path,
        );
        return this.project.templateCards(template);
      }
    }

    let parentCard;
    if (parentCardKey !== ROOT) {
      parentCard = this.project.findCard(parentCardKey);
      return this.project.cardKeysToCards(parentCard.children);
    }

    return this.project
      .showProjectCards()
      .filter((item) => item.parent === 'root' || item.parent === '');
  }

  // Rebalances cards
  private async rebalanceCards(cards: Card[]) {
    const ranks = rebalanceRanks(cards.length);

    cards = sortItems(cards, (item) => item.metadata?.rank || 'z');

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      await this.project.updateCardMetadataKey(card.key, 'rank', ranks[i]);
    }
  }

  // Rebalances the project recursively.
  private async rebalanceProjectRecursively(cards: Card[]) {
    const ranks = rebalanceRanks(cards.length);

    cards = sortItems(cards, (item) => item.metadata?.rank || 'z');

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      await this.project.updateCardMetadataKey(card.key, 'rank', ranks[i]);
      if (card.children && card.children.length > 0) {
        await this.rebalanceProjectRecursively(
          this.project.cardKeysToCards(card.children),
        );
      }
    }
  }

  /**
   * Moves card from 'destination' to 'source'.
   * @param source source card to move
   * @param destination destination card where source card will be moved to; or to root
   */
  @write
  public async moveCard(source: string, destination: string) {
    if (source === ROOT) {
      throw new Error('Cannot move "root"');
    }
    if (source === destination) {
      throw new Error(`Card cannot be moved to itself`);
    }
    const movingToRoot = destination === ROOT;
    const sourceCard = this.project.findCard(source);
    const destinationCard = !movingToRoot
      ? this.project.findCard(destination)
      : undefined;

    // Prevent moving card to inside its descendants
    if (destinationCard) {
      const { parents } = cardPathParts(
        this.project.projectPrefix,
        destinationCard.path,
      );
      if (parents.includes(source)) {
        throw new Error(`Card cannot be moved to inside itself`);
      }
    }

    // Imported templates cannot be modified.
    if (
      (destinationCard && isModuleCard(destinationCard)) ||
      isModuleCard(sourceCard)
    ) {
      throw new Error(`Cannot modify imported module templates`);
    }

    // Special handling for moving to root
    if (movingToRoot) {
      if (isTemplateCard(sourceCard)) {
        throw new Error(`Template cards cannot be moved to project root`);
      }
    } else {
      const bothTemplateCards =
        isTemplateCard(sourceCard) &&
        destinationCard &&
        isTemplateCard(destinationCard);
      const bothProjectCards =
        this.project.hasProjectCard(sourceCard.key) &&
        destinationCard &&
        this.project.hasProjectCard(destinationCard.key);
      if (!(bothTemplateCards || bothProjectCards)) {
        throw new Error(
          `Cards cannot be moved from project to template or vice versa`,
        );
      }
    }

    const destinationPath = movingToRoot
      ? join(this.project.paths.cardRootFolder, sourceCard.key)
      : join(destinationCard!.path, 'c', sourceCard.key);

    // if the card is already in the destination, do nothing
    if (sourceCard.path === destinationPath) {
      return;
    }

    // if both are project cards, make sure source card can be moved
    const actionGuard = new ActionGuard(this.project.calculationEngine);
    await actionGuard.checkPermission('move', source);

    // re-rank the card in the new location
    // it will be the last one in the new location
    let children;
    if (!movingToRoot) {
      const parent = this.project.findCard(destination);
      children = this.project.cardKeysToCards(parent.children);
    } else {
      children = this.project.showProjectCards();
    }

    if (!children) {
      throw new Error(`Children not found from card ${destination}`);
    }

    children = sortItems(children, (item) => item?.metadata?.rank || '1|z');
    const lastChild = children[children.length - 1];

    const rank =
      lastChild && lastChild.metadata
        ? getRankAfter(lastChild.metadata.rank)
        : FIRST_RANK;

    // First do the file operations, then update metadata
    await copyDir(sourceCard.path, destinationPath);
    await deleteDir(sourceCard.path);

    // Update card with new path, parent, and rank
    sourceCard.path = destinationPath!;
    sourceCard.parent = movingToRoot ? ROOT : destination;
    if (sourceCard.metadata) {
      sourceCard.metadata.rank = rank;
    }

    // Handle cache update and persistence
    await this.project.updateCard(sourceCard);
    const updatedCard: Card = {
      ...sourceCard,
      path: destinationPath,
      parent: movingToRoot ? ROOT : destination,
      metadata: sourceCard.metadata
        ? {
            ...sourceCard.metadata,
            rank: rank,
          }
        : undefined,
    };

    // Fetch old parent
    const oldParent = sourceCard.parent;
    let oldParentCard: Card | undefined;
    if (oldParent && oldParent !== ROOT) {
      oldParentCard = this.project.findCard(oldParent);
    }

    let newParentCard: Card | undefined;
    if (!movingToRoot) {
      newParentCard = this.project.findCard(destination);
    }

    // Finally, update the project
    await this.project.handleCardMoved(
      updatedCard,
      newParentCard,
      oldParentCard,
    );
  }

  /**
   * Ranks card using position given as 'index'.
   * @param cardKey card key
   * @param index to which position should card be ranked to
   */
  @write
  public async rankByIndex(cardKey: string, index: number) {
    if (index < 0) {
      throw new Error(`Index must be greater than 0`);
    }
    if (index === 0) {
      await this.rankFirst(cardKey);
      return;
    }

    const card = this.project.findCard(cardKey);
    if (!card.parent) {
      throw new Error(`Parent card ${cardKey} not found from project`);
    }

    const children = sortItems(
      this.getSiblings(card),
      (item) => item.metadata?.rank || EMPTY_RANK,
    );

    if (!children || children.length === 0) {
      throw new Error(`Children not found from card ${card.parent}`);
    }

    if (children.length < index) {
      throw new Error(`Index ${index} is out of bounds`);
    }
    await this.rankCard(cardKey, children[index - 1].key);
  }

  /**
   * Sets the rank of a card to be after another card.
   * @param cardKey Card to rank
   * @param beforeCardKey Card key after which the card will be ranked
   */
  @write
  public async rankCard(cardKey: string, beforeCardKey: string) {
    const card = this.project.findCard(cardKey);
    const beforeCard = this.project.findCard(beforeCardKey);

    if (beforeCard.parent !== card.parent) {
      throw new Error(`Cards must be from the same parent`);
    }

    const children = sortItems(
      this.getSiblings(beforeCard),
      (item) => item.metadata?.rank || EMPTY_RANK,
    );

    if (!children) {
      throw new Error(`Children not found from card ${beforeCard.parent}`);
    }

    const beforeCardIndex = children.findIndex(
      (child) => child.key === beforeCard.key,
    );

    if (beforeCardIndex === -1) {
      throw new Error(
        `Card ${beforeCardKey} is not a child of ${beforeCard.parent}`,
      );
    }

    if (children[beforeCardIndex].key === cardKey) {
      throw new Error(`Card cannot be ranked after itself`);
    }

    if (beforeCardIndex === children.length - 1) {
      await this.project.updateCardMetadataKey(
        cardKey,
        'rank',
        getRankAfter(beforeCard.metadata?.rank as string),
      );
    } else {
      await this.project.updateCardMetadataKey(
        cardKey,
        'rank',
        getRankBetween(
          beforeCard.metadata?.rank as string,
          children[beforeCardIndex + 1].metadata?.rank as string,
        ),
      );
    }
  }

  /**
   * Ranks card first.
   * @param cardKey card key
   */
  @write
  public async rankFirst(cardKey: string) {
    const card = this.project.findCard(cardKey);
    const children = sortItems(
      this.getSiblings(card),
      (item) => item.metadata?.rank || EMPTY_RANK,
    );

    if (!children || children.length === 0) {
      throw new Error(`Children not found from card ${card.parent}`);
    }

    if (children[0].key === cardKey && children[0].metadata?.rank) {
      return;
    }

    const firstRank = children[0].metadata?.rank;
    if (!firstRank) {
      await this.project.updateCardMetadataKey(cardKey, 'rank', FIRST_RANK);
      return;
    }

    // Set the rank to be the first one
    if (firstRank === FIRST_RANK) {
      // if the first card is already at the first rank, we need to move the card to the next one
      const secondRank = children[1].metadata?.rank;
      if (!secondRank) {
        throw new Error(`Second rank not found`);
      }
      const rankBetween = getRankBetween(firstRank, secondRank);
      await this.project.updateCardMetadataKey(
        children[0].key,
        'rank',
        rankBetween,
      );
      await this.project.updateCardMetadataKey(cardKey, 'rank', firstRank);
    } else {
      // if the card is not at the first rank, we just use the first rank
      await this.project.updateCardMetadataKey(cardKey, 'rank', FIRST_RANK);
    }
  }

  /**
   *  Rebalances the ranks of the children of a card.
   * @param parentCardKey parent card key
   */
  @write
  public async rebalanceChildren(parentCardKey: string) {
    const parentCard = this.project.findCard(parentCardKey);
    if (!parentCard || !parentCard.children) {
      throw new Error(`Card ${parentCardKey} not found from project`);
    }
    await this.rebalanceCards(
      this.project.cardKeysToCards(parentCard.children),
    );
  }

  /**
   * Rebalances the ranks of the cards in the whole project, including templates
   * Can be used even if the ranks do not exist
   */
  @write
  public async rebalanceProject() {
    const cards = this.project.showProjectCards();

    await this.rebalanceProjectRecursively(cards);

    const templateCards = this.project.allTemplateCards();
    const cardGroups = templateCards.reduce(
      (result, card) => {
        // template card root cards always have a parent(, thus this shouldn't happen
        if (!card.parent) {
          return result;
        }
        if (!result[card.parent]) {
          result[card.parent] = [];
        }
        result[card.parent].push(card);
        return result;
      },
      {} as Record<string, Card[]>,
    );

    for (const [, cards] of Object.entries(cardGroups)) {
      await this.rebalanceCards(cards);
    }
  }
}
