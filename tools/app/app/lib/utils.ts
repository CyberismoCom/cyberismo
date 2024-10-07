/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Card,
  CardDetails,
  CardMetadata,
  DataType,
  EnumDefinition,
  MetadataValue,
  ParsedLink,
  Project,
  Workflow,
  WorkflowState,
} from './definitions';
import { useForm } from 'react-hook-form';
import { WorkflowCategory } from '@cyberismocom/data-handler/interfaces/project-interfaces';
import { QueryResult } from '@cyberismocom/data-handler/types/queries';

/**
 * Flattens the Card tree into a single array of Cards
 * @param tree: array of Cards with possible children Card arrays
 * @returns array of all cards
 */
export function flattenTree(tree: Card[]): Card[] {
  const result: Card[] = [];
  tree.forEach((node) => {
    result.push(node);
    if (node.children != null) {
      result.push(...flattenTree(node.children));
    }
  });
  return result;
}

/**
 * Finds the path to the card, if exists
 * @param cardKey: card to search for
 * @param tree: array of Cards with possible children Card arrays
 * @returns array of cards starting from the root and ending with the card
 */
export function findPathTo(cardKey: string, tree: Card[]): Card[] | null {
  for (const card of tree) {
    const path = findPath(cardKey, card);
    if (path) {
      return path;
    }
  }

  return null;
}

/**
 * Finds the path to the card, if exists, starting from a single root card
 * @param cardKey: card to search for
 * @param card: card with possible children Card arrays
 * @returns array of cards starting from the root and ending with the card
 */
function findPath(cardKey: string, card: Card): Card[] | null {
  if (card.key === cardKey) {
    return [card];
  }

  if (card.children) {
    for (const child of card.children) {
      const leaf = findPath(cardKey, child);
      if (leaf) {
        return [card, ...leaf];
      }
    }
  }

  return null;
}

/**
 * Finds the correct workflow for the card, if exists
 * @param card: card to search for
 * @param project: project object
 * @returns Workflow object if found, otherwise null
 */
export function findWorkflowForCard(
  card: CardDetails | Card | null,
  project: Project | null,
): Workflow | null {
  if (!card || !project) return null;

  let workflowName = project.cardTypes.find(
    (cardType) => cardType.name === card.metadata?.cardType,
  )?.workflow;
  if (workflowName == undefined) return null;

  if (workflowName.endsWith('.json')) {
    workflowName = workflowName.slice(0, -5);
  }

  return (
    project.workflows.find((workflow) => workflow.name === workflowName) ?? null
  );
}
/**
 * Replaces the metadata of a card in a tree of cards
 * Note: This function mutates the input array
 * @param key The key of the card being edited
 * @param metadata The new metadata to replace the old metadata with
 * @param cards The tree of cards to search for the card to edit
 * @returns The updated tree of cards
 */
export function replaceCardMetadata(
  key: string,
  metadata: CardMetadata | undefined,
  cards: Card[],
): Card[] {
  if (!metadata) return cards;
  let updatedCards = cards;
  updateCard(updatedCards, key, metadata);
  return updatedCards;
}
function updateCard(cards: Card[], key: string, metadata: CardMetadata) {
  cards.forEach((card) => {
    if (card.key === key) {
      card.metadata = metadata;
    } else {
      if (card.children) {
        updateCard(card.children, key, metadata);
      }
    }
  });
}

/**
 * Hook that allows easy use of multiple modals at once
 * @param modals: object with keys as modal names and values as boolean whether the modal is open
 * @returns object with functions to open and close modals and an object with the current state of the modals
 */
export function useModals<T extends Record<string, boolean>>(modals: T) {
  const [openModals, setOpenModals] =
    useState<Record<keyof T, boolean>>(modals);
  const modalsRef = useRef(modals);

  useEffect(() => {
    // Check for equality
    if (
      Object.keys(modals).every((key) => modals[key] === modalsRef.current[key])
    )
      return;

    // Update the modalsRef
    modalsRef.current = modals;
    setOpenModals(modals);
  }, [modals, setOpenModals]);

  const openModal = useCallback(
    (modal: keyof T) => () => {
      setOpenModals((prev) => ({ ...prev, [modal]: true }));
    },
    [setOpenModals],
  );

  const closeModal = useCallback(
    (modal: keyof T) => () => {
      setOpenModals((prev) => ({ ...prev, [modal]: false }));
    },
    [setOpenModals],
  );

  return { openModal, closeModal, modalOpen: openModals };
}

/**
 * Custom hook for handling forms with dynamic initial values
 */
export function useDynamicForm(values: Object) {
  const { reset, ...rest } = useForm();
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    if (Object.keys(values).length > 0) {
      reset(values);
      setIsReady(true);
    }
  }, [reset, values]);
  return { isReady, ...rest };
}

/**
 * Converts metadata value to string
 * @param metadata: metadata value to convert to string
 * @returns string representation of the metadata value
 */
export function metadataValueToString(
  metadata: MetadataValue,
  dataType: DataType,
  t: (value: string) => string,
  enumValues?: Array<EnumDefinition>,
): string {
  if (metadata instanceof Date) {
    return metadata.toISOString();
  } else if (metadata instanceof Array) {
    return metadata.join(', ');
  } else if (dataType === 'enum') {
    return (
      enumValues?.find((enumValue) => enumValue.enumValue === metadata)
        ?.enumDisplayValue ??
      metadata?.toString() ??
      ''
    );
  } else if (dataType === 'boolean') {
    return metadata ? t('yes') : t('no');
  } else {
    return metadata ? metadata.toString() : '';
  }
}
/**
 * Finds a card in a tree of cards
 * @param cards: array of Cards with possible children Card arrays
 * @param key: key of the card to find
 * @returns card if found, otherwise null
 */
export function findCard(cards: Card[], key: string): Card | null {
  for (const card of cards) {
    if (card.key === key) {
      return card;
    }
    if (card.children) {
      const found = findCard(card.children, key);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**
 * Finds the parent of a card in a tree of cards
 * @param cards: array of Cards with possible children Card arrays
 * @param key: key of the card to find the parent of
 * @returns parent card if found, otherwise null
 */
export function findParentCard(cards: Card[], key: string): Card | null {
  for (const card of cards) {
    if (card.children) {
      if (card.children.some((child) => child.key === key)) {
        return card;
      }
      const found = findParentCard(card.children, key);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**
 * Edits a card in a tree of cards
 * Note: This function mutates the input array
 * @param cards array of cards
 * @param card updated version of the card
 * @returns updated array of cards
 */
export function editCard(cards: Card[], card: Card): Card[] {
  for (let i = 0; i < cards.length; i++) {
    if (cards[i].key === card.key) {
      cards[i] = card;
      return cards;
    }
    if (cards[i].children) {
      cards[i].children = editCard(cards[i].children || [], card);
    }
  }
  return cards;
}

/**
 * Edits a card in a tree of cards based on card details
 * Note: This function mutates the input array
 * @param cards array of cards to edit, usually project.cards
 * @param card updated version of the card
 * @returns updated array of cards
 */
export function editCardDetails(cards: Card[], card: CardDetails): Card[] {
  const listCard = findCard(cards, card.key);
  if (!listCard) {
    return cards;
  }
  return editCard(cards, {
    key: card.key,
    path: card.path,
    metadata: card.metadata,
    children: listCard.children,
  });
}

/**
 * Moves a card in a tree of cards
 * Note: This function mutates the input array
 * @param cards: array of cards
 * @param cardKey: key of the card to move
 * @param newParentKey: key of the new parent card
 * @returns updated array of cards
 */
export function moveCard(
  cards: Card[],
  cardKey: string,
  newParentKey: string,
): Card[] {
  const card = findCard(cards, cardKey);
  if (!card) {
    return cards;
  }
  const parent = findParentCard(cards, cardKey);

  const newParent = findCard(cards, newParentKey);
  if (parent) {
    parent.children =
      parent.children?.filter((child) => child.key !== cardKey) || [];
  } else {
    cards = cards.filter((c) => c.key !== cardKey);
  }
  if (newParent) {
    newParent.children = newParent.children || [];
    newParent.children.push(card);
  } else {
    cards.push(card);
  }
  return cards;
}

/**
 * Counts the number of children of a card, including the card itself and children of children
 * @param card: card to count the children of
 * @returns number of children of the card including the card itself
 */
export function countChildren(card: Card): number {
  if (!card.children) {
    return 1;
  }
  return card.children.reduce((acc, child) => acc + countChildren(child), 1);
}

/**
 * Return true if card is children of the other card
 * @param card parent card to check if the other card is a child of
 * @param key key of the card to check if it is a child of the parent card
 * @returns true if the card is a child of the parent card, otherwise false
 */
export function isChildOf(card: Card, key: string): boolean {
  if (card.children) {
    for (const child of card.children) {
      if (isChildOf(child, key)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Deletes a card from a tree of cards
 * Note: This function mutates the input array
 * @param cards: array of cards
 * @param key: key of the card to delete
 * @returns updated array of cards
 */
export function deleteCard(cards: Card[], key: string): Card[] {
  for (const card of cards) {
    if (card.key === key) {
      return cards.filter((c) => c.key !== key);
    }
    if (card.children) {
      card.children = deleteCard(card.children, key);
    }
  }
  return cards;
}

/**
 * Deep copy an object
 * @param obj: object to copy
 * @returns deep copy of the object
 */
export function deepCopy<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Returns all cards, to which it is possible to move the card
 * @param cards: array of cards, which the card might be moved to
 * @param card: card to move
 * @returns array of cards, to which it is possible to move the card
 */
export function getMoveableCards(cards: Card[], card: Card): Card[] {
  const parent = findParentCard(cards, card.key);

  return cards.filter((c) => {
    if (c.key === card.key || parent?.key === c.key) {
      return false;
    }
    if (isChildOf(card, c.key)) {
      return false;
    }
    return true;
  });
}

/**
 * Returns filtered tree of cards
 * @param cards: array of cards to filter
 * @param filter: filter function that returns true if the card should be included
 * @returns filtered array of cards
 */
export function filterCards(
  cards: QueryResult<'tree'>[],
  filter: (card: QueryResult<'tree'>) => boolean,
): QueryResult<'tree'>[] {
  return cards.filter((card) => {
    if (filter(card)) {
      return true;
    }
    if (card.results) {
      card.results = filterCards(card.results, filter);
      return card.results.length > 0;
    }
    return false;
  });
}

/**
 * Returns all links that are connected to a card key excluding the links that are defined in the card metadata
 * @param cardKey: key of the card to find links for
 * @param cards: array of cards to search for links
 * @returns array of cards that are linked to the card and the card it is linked from
 */
export function getLinksForCard(cards: Card[], cardKey: string): ParsedLink[] {
  const links: ParsedLink[] = [];
  for (const card of cards) {
    for (const link of card.metadata?.links || []) {
      if (link.cardKey === cardKey) {
        links.push({
          ...link,
          fromCard: card.key,
        });
      }
    }
    links.push(...getLinksForCard(card.children || [], cardKey));
  }
  return links;
}

/**
 * Calls a function with setIsUpdating set to true before and false after the function call
 * @param setIsUpdating: function to call with true before and false after the function call
 * @param func: function to call
 */
export async function withUpdating<T>(
  setIsUpdating: (updating: boolean) => void,
  func: () => Promise<T>,
): Promise<T> {
  try {
    setIsUpdating(true);
    return await func();
  } finally {
    setIsUpdating(false);
  }
}

/**
 * Returns the color representing the category of the workflow
 * @param state workflow state
 * @returns joy color representing the category of the workflow
 */
export function getStateColor(category: string | undefined) {
  switch (category) {
    case WorkflowCategory.initial:
      return '#CDD7E1'; // 'neutral.300'
    case WorkflowCategory.active:
      return '#F3C896'; // 'warning.300'
    case WorkflowCategory.closed:
      return '#51BC51'; // 'success.400'
    default:
      return 'black';
  }
}
