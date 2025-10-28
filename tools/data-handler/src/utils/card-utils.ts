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
import { CARD_KEY_SEPARATOR, ROOT } from './constants.js';

import type {
  Card,
  CardWithChildrenCards,
} from '../interfaces/project-interfaces.js';
import type { Project } from '../resources/folder-resource.js';

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
        cardMap.get(card.parent)!.children.push(card.key);
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
 * Breaks card path to logical parts: cardKey, list of parents, prefix and template
 * If this is a root card, then parents is undefined.
 * If this is not a template card, then template is undefined.
 * @param prefix Project prefix.
 * @param cardPath Card path to break into parts.
 * @returns Card parts
 * @todo: This could also return module name, if card is from a module
 */
export const cardPathParts = (
  prefix: string,
  cardPath: string,
): {
  cardKey: string | undefined;
  parents: (string | undefined)[];
  prefix: string;
  template: string;
} => {
  const pathParts = cardPath.split(sep);
  const cardKey = pathParts.at(pathParts.length - 1);
  const parents = [];
  let template = '';
  let startIndex = -1;
  let templatesNameIndex = -1;

  const cardRootIndex = pathParts.indexOf('cardRoot');
  const projectInternalsIndex = pathParts.indexOf('.cards');

  if (projectInternalsIndex === -1 && cardRootIndex >= 0) {
    startIndex = projectInternalsIndex;
  } else if (projectInternalsIndex >= 0 && cardRootIndex === -1) {
    const templatesIndex = pathParts.indexOf('templates');
    startIndex = templatesIndex;
    if (templatesIndex === -1) {
      throw new Error(
        `Invalid card path. Template card must have 'templates' in path`,
      );
    }
    const modulesIndex = pathParts.indexOf('modules');
    if (modulesIndex !== -1) {
      prefix = pathParts.at(modulesIndex + 1) || '';
    }
    templatesNameIndex = templatesIndex + 1;
    template = `${prefix}/templates/${pathParts.at(templatesNameIndex)}`;
  } else {
    throw new Error(`Card must be either project card, or template card`);
  }

  // Look for parents in the path.
  let previousWasParent = false;
  for (let index = startIndex; index <= pathParts.length; index++) {
    if (previousWasParent) {
      previousWasParent = false;
      parents.push(pathParts.at(index - 2));
    }
    const cardsSubFolder = pathParts.at(index) === 'c';
    const ignoreOrNotTemplatesParent =
      index - 1 !== templatesNameIndex || templatesNameIndex === -1;
    if (cardsSubFolder && ignoreOrNotTemplatesParent) {
      previousWasParent = true;
    }
  }

  return {
    cardKey: cardKey,
    parents: parents,
    prefix: prefix,
    template: template,
  };
};

/**
 * Find parent path from a card path
 * @param cardPath Card path to find parent path from.
 * @returns Parent path
 */
export const findParentPath = (cardPath: string): string | null => {
  const pathParts = cardPath.split(sep);
  const hasChildren = pathParts.lastIndexOf('c');

  if (hasChildren <= 0) {
    return null;
  }

  const parentPathParts = [...pathParts];
  parentPathParts.splice(hasChildren, 1);
  return parentPathParts.slice(0, hasChildren).join(sep);
};

/**
 * Flattens card tree so that children are shown on same level regardless of nesting level.
 * @param array Card tree to flatten
 * @parent project Project to use
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
export const isModuleCard = (card: Card) => {
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
export const isTemplateCard = (card: Card) => {
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
 * Finds parent card key
 * @param cardPath Card path from which to find parent card
 * @returns Parent card key
 */
export function parentCard(cardPath: string) {
  const pathParts = cardPath.split(sep);
  if (
    pathParts.at(pathParts.length - 2) === 'cardRoot' ||
    (pathParts.length > 3 && pathParts.at(pathParts.length - 4) === 'templates')
  ) {
    return ROOT;
  } else {
    return pathParts.at(pathParts.length - 3);
  }
}

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
