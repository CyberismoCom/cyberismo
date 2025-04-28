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

import { ActionGuard } from '../permissions/action-guard.js';
import { copyDir, deleteDir } from '../utils/file-utils.js';
import { Calculate } from './index.js';
import { Card, FetchCardDetails } from '../interfaces/project-interfaces.js';
import { Project, ResourcesFrom } from '../containers/project.js';
import {
  EMPTY_RANK,
  FIRST_RANK,
  getRankAfter,
  getRankBetween,
  rebalanceRanks,
  sortItems,
} from '../utils/lexorank.js';
import { isTemplateCard } from '../utils/card-utils.js';
import { resourceName } from '../utils/resource-utils.js';
import { TemplateResource } from '../resources/template-resource.js';

// @todo - we should have project wide constants, so that if we need them, only the const value needs to be changed.
const ROOT: string = 'root';

// Ensure that the same details are fetched when moving the card(s)
const cardDetails = {
  children: true,
  metadata: true,
  parent: true,
};

export class Move {
  constructor(
    private project: Project,
    private calculateCmd: Calculate,
  ) {}

  // Fetches a card (either template or project card).
  private async getCard(cardKey: string, options: FetchCardDetails) {
    let card: Card | undefined;
    const templateCard = await this.project.isTemplateCard(cardKey);
    if (templateCard) {
      card = (await this.project.templateCards(options)).find(
        (card) => card.key === cardKey,
      );
    } else {
      card = await this.project.findSpecificCard(cardKey, options);
    }
    if (!card) {
      throw new Error('Card was not found from the project');
    }
    return card;
  }

  // Returns children of a parent card or root cards
  private async getSiblings(card: Card) {
    const parentCardKey = card.parent || ROOT;

    // since we don't know if 'root' is templateRoot or cardRoot, we need to check the card
    if (parentCardKey === ROOT) {
      if (isTemplateCard(card)) {
        const template = this.project.createTemplateObjectFromCard(card);
        if (!template) {
          throw new Error(
            `Cannot find template for the template card '${card.key}'`,
          );
        }
        if (card?.path.includes(`${sep}modules${sep}`)) {
          throw new Error(`Cannot rank module cards`);
        }
        return template.cards();
      }
    }

    let parentCard;
    if (parentCardKey !== ROOT) {
      parentCard = await this.project.findSpecificCard(parentCardKey, {
        children: true,
        metadata: true,
      });
      if (!parentCard) {
        throw new Error(`Card ${parentCardKey} not found from project`);
      }
    }

    if (parentCard) {
      return parentCard.children || [];
    }

    return this.project.showProjectCards();
  }

  //
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
        await this.rebalanceProjectRecursively(card.children);
      }
    }
  }

  /**
   * Moves card from 'destination' to 'source'.
   * @param source source card to move
   * @param destination destination card where source card will be moved to; or to root
   */
  public async moveCard(source: string, destination: string) {
    if (source === ROOT) {
      throw new Error('Cannot move "root"');
    }
    if (source === destination) {
      throw new Error(`Card cannot be moved to itself`);
    }
    const promiseContainer = [];
    promiseContainer.push(this.project.findSpecificCard(source, cardDetails));
    if (destination !== ROOT) {
      promiseContainer.push(
        this.project.findSpecificCard(destination, cardDetails),
      );
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

    if (destinationCard.path.includes(source)) {
      throw new Error(`Card cannot be moved to inside itself`);
    }

    // Imported templates cannot be modified.
    if (
      destinationCard.path.includes(`${sep}modules`) ||
      sourceCard.path.includes(`${sep}modules${sep}`)
    ) {
      throw new Error(`Cannot modify imported module templates`);
    }

    const bothTemplateCards =
      isTemplateCard(sourceCard) && isTemplateCard(destinationCard);
    const bothProjectCards =
      this.project.hasCard(sourceCard.key) &&
      this.project.hasCard(destinationCard.key);
    if (!(bothTemplateCards || bothProjectCards)) {
      throw new Error(
        `Cards cannot be moved from project to template or vice versa`,
      );
    }

    const destinationPath =
      destination === ROOT
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
    if (destination !== ROOT) {
      const parent = await this.project.findSpecificCard(
        destination,
        cardDetails,
      );
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
   * Ranks card using position given as 'index'.
   * @param cardKey card key
   * @param index to which position should card be ranked to
   */
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
      await this.getSiblings(card),
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
  public async rankCard(cardKey: string, beforeCardKey: string) {
    const card = await this.project.findSpecificCard(cardKey, cardDetails);
    if (!card) {
      throw new Error(`Card ${cardKey} not found from project`);
    }

    const beforeCard = await this.project.findSpecificCard(
      beforeCardKey,
      cardDetails,
    );

    if (!beforeCard) {
      throw new Error(`Card ${beforeCardKey} not found from project`);
    }

    if (beforeCard.parent !== card.parent) {
      throw new Error(`Cards must be from the same parent`);
    }

    const children = sortItems(
      await this.getSiblings(beforeCard),
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

  /**
   * Ranks card first.
   * @param cardKey card key
   */
  public async rankFirst(cardKey: string) {
    const card = await this.getCard(cardKey, cardDetails);

    const children = sortItems(
      await this.getSiblings(card),
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
      const templateResource = new TemplateResource(
        this.project,
        resourceName(template.name),
      );
      const templateObject = templateResource.templateObject();

      if (!templateObject) {
        throw new Error(`Template '${template.name}' not found`);
      }

      const templateCards = await templateObject.cards('', cardDetails);

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
        await this.rebalanceCards(cards);
      }
    }
  }
}
