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

import { sep } from 'node:path';
import { CARD_KEY_SEPARATOR } from './constants.js';

import type {
  Card,
  CardWithChildrenCards,
} from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';

/**
 * Builds card hierarchy from flat card list with nested card objects.
 * This converts the cards hierarchy (where children are string[]) to
 * CardWithChildrenCards[] (where children are Card[]).
 * @param flatCards Cards in a flat array.
 * @returns Cards in hierarchical array with nested card objects
 */
export const buildCardHierarchy = (
  flatCards: Card[],
): CardWithChildrenCards[] => {
  const cardMap = new Map(flatCards.map((card) => [card.key, card]));

  // Helper to get cards as a map
  function cards(flatCards: Card[]) {
    const cardMap = new Map(
      flatCards.map((card) => [
        card.key,
        { ...card, children: [] as string[] },
      ]),
    );

    const rootCards: Card[] = [];
    cardMap.forEach((card) => {
      if (card.parent && cardMap.has(card.parent)) {
        const parentCard = cardMap.get(card.parent);
        if (parentCard) {
          parentCard.children.push(card.key);
        }
      } else {
        rootCards.push(card);
      }
    });

    return rootCards;
  }

  // Helper to convert from string[] => Card[] children
  function convert(card: Card): CardWithChildrenCards {
    const childrenCards = card.children.map((childKey) => {
      const childCard = cardMap.get(childKey)!;
      return convert(childCard);
    });

    return {
      ...card,
      childrenCards,
    };
  }

  const rootCards = cards(flatCards);
  return rootCards.map(convert);
};

/**
 * Flattens card tree so that children are shown on same level regardless of nesting level.
 * @param array Card tree to flatten
 * @param project Project to use
 * @returns Flattened card tree.
 */
export const flattenCardArray = (array: Card[], project: Project) => {
  const result: Card[] = [];

  array.forEach((item) => {
    const { key, path, children, attachments, metadata } = item;
    const childCardIds = project
      .cardKeysToCards(children)
      .map((item) => item.key);

    result.push({
      key,
      path,
      children: [...childCardIds],
      attachments,
      metadata,
    });
    if (children) {
      result.push(
        ...flattenCardArray(project.cardKeysToCards(children), project),
      );
    }
  });
  return result;
};

/**
 * Checks if given card is in some module.
 * @param card Card object to check
 * @returns true if card exists in a module; false otherwise
 */
export const isModuleCard = (card: Pick<Card, 'path'>) => {
  return card.path.includes(`${sep}modules${sep}`);
};

/**
 * Checks if given path is from a module.
 * @param path Path to check
 * @returns true if path is from a module; false otherwise
 */
export const isModulePath = (path: string) => {
  return path.includes(`${sep}modules${sep}`);
};

/**
 * Checks if given card is in some template.
 * @param card card object to check
 * @returns true if card exists in a template; false otherwise
 */
export const isTemplateCard = (card: Pick<Card, 'path'>) => {
  return (
    card.path.includes(`${sep}templates${sep}`) ||
    card.path.includes(`${sep}modules${sep}`)
  );
};

/**
 * Returns module name from card key
 * @param cardKey Card key
 * @returns module name
 * @todo: should be renamed to modulePrefixFromCardKey
 */
export const moduleNameFromCardKey = (cardKey: string) => {
  const parts = cardKey.split(CARD_KEY_SEPARATOR);
  if (parts.length !== 2) {
    throw new Error(`Invalid card key: ${cardKey}`);
  }
  return parts[0];
};

/**
 * Sorts array of cards first using prefix and then using ID.
 * Prefixes are returned in alphabetical order, and then in numeric order within same prefix.
 * For example, test_za1, test_aa7 and demo_aaa are sorted to: demo_aaa, test_aa7, test_za1.
 * @param a First card to be sorted
 * @param b Second card to be sorted
 * @returns Cards ordered; first by prefixes, then by ID.
 */
export const sortCards = (a: string, b: string) => {
  const aParts = a.split(CARD_KEY_SEPARATOR);
  const bParts = b.split(CARD_KEY_SEPARATOR);
  if (aParts[0] !== bParts[0]) {
    if (aParts[0] > bParts[0]) return 1;
    if (aParts[0] < bParts[0]) return -1;
    return 0;
  }
  if (a.length > b.length) {
    return 1;
  }
  if (a.length < b.length) {
    return -1;
  }
  if (aParts[1] > bParts[1]) return 1;
  if (aParts[1] < bParts[1]) return -1;
  return 0;
};

/**
 * Checks whether a value is an external item key (connector:itemKey format)
 * rather than a card key (prefix_id format). Card keys never contain colons.
 */
export const isExternalItemKey = (value: string) => value.includes(':');
