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
  DataType,
  EnumDefinition,
  ExpandedLinkType,
  MetadataValue,
  Project,
  Workflow,
} from './definitions';
import { useForm } from 'react-hook-form';
import {
  LinkType,
  WorkflowCategory,
} from '@cyberismocom/data-handler/interfaces/resource-interfaces';
import { QueryResult } from '@cyberismocom/data-handler/types/queries';

/**
 * Flattens the Card tree into a single array of Cards
 * @param tree: array of Cards with possible children Card arrays
 * @returns array of all cards
 */
export function flattenTree(
  tree: QueryResult<'tree'>[],
): QueryResult<'tree'>[] {
  const result: QueryResult<'tree'>[] = [];
  tree.forEach((node) => {
    result.push(node);
    result.push(...flattenTree(node.children ?? []));
  });
  return result;
}

/**
 * Finds the path to the card, if exists
 * @param cardKey: card to search for
 * @param tree: array of Cards with possible children Card arrays
 * @returns array of cards starting from the root and ending with the card
 */
export function findPathTo(
  cardKey: string,
  tree: QueryResult<'tree'>[],
): QueryResult<'tree'>[] | null {
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
function findPath(
  cardKey: string,
  card: QueryResult<'tree'>,
): QueryResult<'tree'>[] | null {
  if (card.key === cardKey) {
    return [card];
  }

  for (const child of card.children ?? []) {
    const leaf = findPath(cardKey, child);
    if (leaf) {
      return [card, ...leaf];
    }
  }

  return null;
}

/**
 * Finds the correct workflow for the card, if exists
 * @param cardType: cardType to search for
 * @param project: project object
 * @returns Workflow object if found, otherwise null
 */
export function findWorkflowForCardType(
  cardType: string,
  project: Project,
): Workflow | null {
  let workflowName = project.cardTypes.find(
    (cardTypeObject) => cardTypeObject.name === cardType,
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
export function findCard(
  cards: QueryResult<'tree'>[],
  key: string,
): QueryResult<'tree'> | null {
  for (const card of cards) {
    if (card.key === key) {
      return card;
    }
    const found = findCard(card.children ?? [], key);
    if (found) {
      return found;
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
export function findParentCard(
  cards: QueryResult<'tree'>[],
  key: string,
): QueryResult<'tree'> | null {
  for (const card of cards) {
    if (card.children?.some((child) => child.key === key)) {
      return card;
    }
    const found = findParentCard(card.children ?? [], key);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * Counts the number of children of a card, including the card itself and children of children
 * @param treeRoot root card of the search space
 * @returns number of children of the card including the card itself
 */
export function countChildren(treeRoot: QueryResult<'tree'>): number {
  if (!treeRoot.children) {
    return 1;
  }
  return treeRoot.children.reduce(
    (acc, child) => acc + countChildren(child),
    1,
  );
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
 * @param tree: tree of cards, which the card might be moved to
 * @param card: card to move
 * @returns array of cards, to which it is possible to move the card
 */
export function getMoveableCards(
  tree: QueryResult<'tree'>[],
  cardKey: string,
): QueryResult<'tree'>[] {
  const cards: QueryResult<'tree'>[] = [];
  for (const card of tree) {
    if (card.key === cardKey) {
      // Skip the card itself and do not recurse into its children
      continue;
    }
    const isParent = card.children?.some((c) => c.key === cardKey);
    // it's not the parent(or below it), so we can just return this + its children
    cards.push(...getMoveableCards(card.children ?? [], cardKey));
    if (!isParent) {
      cards.push(card);
    }
  }
  return cards;
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
    if (card.children) {
      card.children = filterCards(card.children, filter);
      return card.children.length > 0;
    }
    return false;
  });
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

/**
 * Returns link types for the card
 */
export function expandLinkTypes(
  linkTypes: LinkType[],
  cardType: string,
): ExpandedLinkType[] {
  const result: ExpandedLinkType[] = [];

  let id = 0;
  for (const type of linkTypes) {
    if (!cardType) continue;
    // Check if this card is in from or to list
    if (
      type.sourceCardTypes.includes(cardType) ||
      type.sourceCardTypes.length === 0
    ) {
      result.push({
        ...type,
        direction: 'outbound',
        id: id++,
      });
    }
    if (
      type.destinationCardTypes.includes(cardType) ||
      type.destinationCardTypes.length === 0
    ) {
      result.push({
        ...type,
        direction: 'inbound',
        id: id++,
      });
    }
  }
  return result;
}
