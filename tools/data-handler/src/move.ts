/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { join, sep } from 'node:path';

import { copyDir, deleteDir } from './utils/file-utils.js';
import { Card } from './interfaces/project-interfaces.js';
import { Project, ResourcesFrom } from './containers/project.js';
import {
  EMPTY_RANK,
  FIRST_RANK,
  getRankAfter,
  getRankBetween,
  rebalanceRanks,
  sortItems,
} from './utils/lexorank.js';
import { ActionGuard } from './permissions/action-guard.js';
import { Calculate } from './calculate.js';

export class Move {
  constructor(
    private project: Project,
    private calculateCmd: Calculate,
  ) {}

  /**
   * Moves card from 'destination' to 'source'.
   * @param source source card to move
   * @param destination destination card where source card will be moved to; or 'root'
   */
  public async moveCard(source: string, destination: string) {
    const promiseContainer = [];
    promiseContainer.push(this.project.findSpecificCard(source));
    if (destination !== 'root') {
      promiseContainer.push(this.project.findSpecificCard(destination));
    } else {
      const returnObject: Card = {
        key: '',
        path: this.project.paths.cardRootFolder,
        children: [],
        attachments: [],
      };
      promiseContainer.push(Promise.resolve(returnObject));
    }
    const [sourceCard, destinationCard] = await Promise.all(promiseContainer);

    if (!sourceCard) {
      throw new Error(`Card ${source} not found from project`);
    }
    if (!destinationCard) {
      throw new Error(`Card ${destination} not found from project`);
    }

    // Imported templates cannot be modified.
    if (
      destinationCard.path.includes(`${sep}modules`) ||
      sourceCard.path.includes(`${sep}modules${sep}`)
    ) {
      throw new Error(`Cannot modify imported module templates`);
    }

    const bothTemplateCards =
      Project.isTemplateCard(sourceCard) &&
      Project.isTemplateCard(destinationCard);
    const bothProjectCards =
      this.project.hasCard(sourceCard.key) &&
      this.project.hasCard(destinationCard.key);
    if (!(bothTemplateCards || bothProjectCards)) {
      throw new Error(
        `Cards cannot be moved from project to template or vice versa`,
      );
    }

    const destinationPath =
      destination === 'root'
        ? join(this.project.paths.cardRootFolder, sourceCard.key)
        : join(destinationCard.path, 'c', sourceCard.key);

    // if the card is already in the destination, do nothing
    if (sourceCard.path === destinationPath) {
      return;
    }

    // if both are project cards, make sure source card can be moved
    const actionGuard = new ActionGuard(this.calculateCmd);
    await actionGuard.checkPermission('move', source);

    // rerank the card in the new location
    // it will be the last one in the new location
    let children;
    if (destination !== 'root') {
      const parent = await this.project.findSpecificCard(destination, {
        children: true,
        metadata: true,
      });
      if (!parent) {
        throw new Error(`Parent card ${destination} not found from project`);
      }
      children = parent.children;
    } else {
      children = await this.project.showProjectCards();
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
    await this.project.updateCardMetadataKey(sourceCard.key, 'rank', rank);
    await copyDir(sourceCard.path, destinationPath);
    await deleteDir(sourceCard.path);
  }

  /**
   * Sets the rank of a card to be after another card.
   * @param cardKey Card to rank
   * @param beforeCardKey Card key after which the card will be ranked
   */
  public async rankCard(cardKey: string, beforeCardKey: string) {
    const card = await this.project.findSpecificCard(cardKey, {
      metadata: true,
      parent: true,
    });
    if (!card) {
      throw new Error(`Card ${cardKey} not found from project`);
    }

    const beforeCard = await this.project.findSpecificCard(beforeCardKey, {
      metadata: true,
      parent: true,
    });

    if (!beforeCard) {
      throw new Error(`Card ${beforeCardKey} not found from project`);
    }

    if (beforeCard.parent !== card.parent) {
      throw new Error(`Cards must be from the same parent`);
    }

    const children = sortItems(
      await this.getChildren(beforeCard.parent || 'root'),
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

    if (
      children[beforeCardIndex].key === cardKey ||
      children[beforeCardIndex + 1]?.key === cardKey
    ) {
      throw new Error(`Card ${cardKey} is already in the correct position`);
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

  public async rankByIndex(cardKey: string, index: number) {
    if (index < 0) {
      throw new Error(`Index must be greater than 0`);
    }
    if (index === 0) {
      await this.rankFirst(cardKey);
      return;
    }

    const card = await this.project.findSpecificCard(cardKey, {
      metadata: true,
      parent: true,
    });

    if (!card || !card.parent) {
      throw new Error(`Card ${cardKey} not found from project`);
    }

    const children = sortItems(
      await this.getChildren(card.parent),
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

  public async rankFirst(cardKey: string) {
    const card = await this.project.findSpecificCard(cardKey, {
      metadata: true,
      parent: true,
    });
    if (!card) {
      throw new Error(`Card ${cardKey} not found from project`);
    }

    const children = sortItems(
      await this.getChildren(card.parent || 'root'),
      (item) => item.metadata?.rank || EMPTY_RANK,
    );

    if (!children || children.length === 0) {
      throw new Error(`Children not found from card ${card.parent}`);
    }

    if (children[0].key === cardKey) {
      return;
    }

    const firstRank = children[0].metadata?.rank;

    if (!firstRank) {
      throw new Error(`First rank not found`);
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
   * Rebalances the ranks of the cards in the whole project, including templates
   * Can be used even if the ranks do not exist
   */
  public async rebalanceProject() {
    const cards = await this.project.showProjectCards();

    await this.rebalanceProjectRecursively(cards);

    // rebalance templates
    const templates = await this.project.templates(ResourcesFrom.localOnly);
    for (const template of templates) {
      const templateObject = await this.project.createTemplateObject(template);

      if (!templateObject) {
        throw new Error(`Template '${template.name}' not found`);
      }

      const templateCards = await templateObject.cards('', {
        parent: true,
        metadata: true,
      });

      const cardGroups = templateCards.reduce(
        (result, card) => {
          // template card root cards have a parent(the template itself) so this shouldn't happen
          if (!card.parent) {
            return result;
          }
          // if the parent does not exist yet in the result, we create it
          if (!result[card.parent]) {
            result[card.parent] = [];
          }
          result[card.parent].push(card);
          return result;
        },
        {} as Record<string, Card[]>,
      );

      for (const [, cards] of Object.entries(cardGroups)) {
        // todo: this could be done parallel
        await this.rebalanceCards(cards);
      }
    }
  }

  /**
   *  Rebalances the ranks of the children of a card.
   * @param parentCardKey
   */
  public async rebalanceChildren(parentCardKey: string) {
    const parentCard = await this.project.findSpecificCard(parentCardKey, {
      children: true,
      metadata: true,
    });
    if (!parentCard || !parentCard.children) {
      throw new Error(`Card ${parentCardKey} not found from project`);
    }
    await this.rebalanceCards(parentCard.children);
  }

  private async rebalanceCards(cards: Card[]) {
    const ranks = rebalanceRanks(cards.length);

    cards = sortItems(cards, (item) => item.metadata?.rank || 'z');

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      await this.project.updateCardMetadataKey(card.key, 'rank', ranks[i]);
    }
  }

  //
  private async rebalanceProjectRecursively(cards: Card[]) {
    const ranks = rebalanceRanks(cards.length);

    cards = sortItems(cards, (item) => item.metadata?.rank || 'z');

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      await this.project.updateCardMetadataKey(card.key, 'rank', ranks[i]);
      if (card.children && card.children.length > 0) {
        await this.rebalanceProjectRecursively(card.children);
      }
    }
  }

  // Returns children of a parent card or root cards
  private async getChildren(parentCardKey: string) {
    if (parentCardKey === 'root') {
      return this.project.showProjectCards();
    } else {
      const parentCard = await this.project.findSpecificCard(parentCardKey, {
        children: true,
        metadata: true,
      });
      if (!parentCard) {
        throw new Error(`Card ${parentCardKey} not found from project`);
      }
      return parentCard.children || [];
    }
  }
}
