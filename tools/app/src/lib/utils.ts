/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { useEffect, useState, useRef, useCallback } from 'react';
import type {
  DataType,
  EnumDefinition,
  ExpandedLinkType,
  MetadataValue,
  Project,
  Workflow,
} from './definitions';
import { useForm } from 'react-hook-form';
import type { LinkType } from '@cyberismo/data-handler/interfaces/resource-interfaces';
import { WorkflowCategory } from '@cyberismo/data-handler/interfaces/resource-interfaces';
import type {
  QueryResult,
  CalculationLink,
} from '@cyberismo/data-handler/types/queries';
import type { AnyNode } from './api/types';
import type { CardResponse } from './api/types';
import type { AppConfig } from './definitions';

// Gets type of a child of an array
type ItemType<T> = T extends (infer U)[] ? U : never;

/**
 * Determines if a new link can be created between a current card and a target card.
 * @param currentCardKey Key of the source card.
 * @param selectedLinkType The type of link to create.
 * @param currentCardLinks Existing links of the source card (to avoid duplicates).
 * @param potentialTargetCard The potential target card for the new link.
 * @returns True if the link is valid and can be created, false otherwise.
 */
export function canCreateLinkToCard(
  currentCardKey: string,
  selectedLinkType: ExpandedLinkType | undefined,
  currentCardLinks: CalculationLink[],
  potentialTargetCard: QueryResult<'tree'>,
): boolean {
  if (!selectedLinkType || potentialTargetCard.key === currentCardKey)
    return false;
  if (!isCardTypePermittedForLinkType(selectedLinkType, potentialTargetCard))
    return false;
  if (isAlreadyLinked(currentCardLinks, potentialTargetCard, selectedLinkType))
    return false;
  return true;
}
/**
 * Loads the config.json file and returns the config.
 * @returns the config.json file.
 */
export const config: AppConfig = await fetch('/config.json')
  .then((res) => res.json())
  .catch(() => {
    return { staticMode: false };
  });

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
 * Creates a predicate function from a base function and a list of initial arguments
 * @param baseFunction: base function to create the predicate from
 * @param args: initial arguments for the base function
 * @returns predicate function
 */
export function createPredicate<
  InitialArgs extends unknown[],
  RemainingArgs extends unknown[],
  R,
>(
  baseFunction: (...args: [...InitialArgs, ...RemainingArgs]) => R,
  ...args: InitialArgs
): (...remainingArgs: RemainingArgs) => R {
  return (...remainingArgs: RemainingArgs): R =>
    baseFunction(...args, ...remainingArgs);
}

/**
 * Deep copy an object
 * @param obj: object to copy
 * @returns deep copy of the object
 */
export function deepCopy<T>(obj: T): T | null {
  if (obj == null) {
    return obj;
  }
  return JSON.parse(JSON.stringify(obj));
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
 * Finds a resource node anywhere in the resource tree by its full name
 * @param nodes: resource tree
 * @param name: name of the resource node to find
 * @returns resource node if found, otherwise null
 */
export function findResourceNodeByName(
  nodes: AnyNode[] | undefined,
  name: string,
): AnyNode | null {
  if (!nodes) return null;
  for (const node of nodes) {
    if (node.name === name) return node;
    const found = findResourceNodeByName(node.children, name);
    if (found) return found;
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
 * Converts the card response value to a metadata value
 * @param value the value of the field in the card query
 * @returns a metadata value, which can be used in forms
 */
export function getDefaultValue(
  value: ItemType<CardResponse['fields']>['value'],
): MetadataValue {
  if (typeof value !== 'object') {
    return value;
  }
  if (value == null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((listValue) => listValue.value);
  }
  return value.value;
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
      return 'transparent';
  }
}

/**
 * Return true if card is already linked to the current card
 * @param currentCardLinks: array of links for the current card
 * @param potentialTargetCard: card to check if it is already linked to the current card
 * @param selectedLinkType: link type to check if the card is already linked to the current card
 * @returns true if the card is already linked to the current card
 */
export function isAlreadyLinked(
  currentCardLinks: CalculationLink[],
  potentialTargetCard: QueryResult<'tree'>,
  selectedLinkType: ExpandedLinkType,
): boolean {
  return currentCardLinks.some(
    (existingLink) =>
      !selectedLinkType.enableLinkDescription &&
      existingLink.key === potentialTargetCard.key &&
      existingLink.linkType === selectedLinkType.name &&
      existingLink.direction === selectedLinkType.direction,
  );
}

/**
 * Checks if a potential target card's type is permitted by the selected link type's rules.
 * @param selectedLinkType The link type defining compatibility rules.
 * @param potentialTargetCard The card to check.
 * @returns True if the card's type is compatible with the link type, false otherwise.
 */
export function isCardTypePermittedForLinkType(
  selectedLinkType: ExpandedLinkType,
  potentialTargetCard: QueryResult<'tree'>,
): boolean {
  if (selectedLinkType.direction === 'outbound') {
    return (
      selectedLinkType.destinationCardTypes.includes(
        potentialTargetCard.cardType,
      ) || selectedLinkType.destinationCardTypes.length === 0
    );
  } else {
    return (
      selectedLinkType.sourceCardTypes.includes(potentialTargetCard.cardType) ||
      selectedLinkType.sourceCardTypes.length === 0
    );
  }
}

/**
 * Returns true if the value is a string
 * @param value: value to check if it is a string
 * @returns true if the value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
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
    return metadata
      .map(
        (value) =>
          enumValues?.find((enumValue) => enumValue.enumValue === value)
            ?.enumDisplayValue ??
          value?.toString() ??
          '',
      )
      .join(', ');
  } else if (dataType === 'enum') {
    return (
      enumValues?.find((enumValue) => enumValue.enumValue === metadata)
        ?.enumDisplayValue ??
      metadata?.toString() ??
      ''
    );
  } else if (dataType === 'boolean') {
    if (metadata == null) {
      return '';
    }
    return metadata ? t('yes') : t('no');
  } else {
    return metadata ? metadata.toLocaleString() : '';
  }
}

/**
 * Parses data attributes with dot notation back into a nested object structure
 * @param attribs - The HTML element attributes object
 * @returns An object with nested structure based on dot notation in data attributes
 */
export function parseDataAttributes(
  attribs: Record<string, string>,
): Record<string, unknown> {
  const attributes = parseNestedDataAttributes(attribs);
  let options = {};
  if (attributes.options && typeof attributes.options === 'string') {
    const binary = atob(attributes.options);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    options = JSON.parse(new TextDecoder().decode(bytes));
  }
  return {
    ...attributes,
    ...options,
  };
}

/**
 * Parses data attributes with dot notation back into a nested object structure
 * @param attribs - The HTML element attributes object
 * @returns An object with nested structure based on dot notation in data attributes
 */
export function parseNestedDataAttributes(
  attribs: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  Object.entries(attribs).forEach(([key, value]) => {
    const parts = key.split('.');
    let current = result;

    // Navigate through all parts except the last one
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      current[part] = current[part] || {};
      current = current[part] as Record<string, unknown>;
    }

    // Set the value at the last part
    const lastPart = parts[parts.length - 1];
    current[lastPart] = value;
  });

  return result;
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
export function useDynamicForm(values: Record<string, unknown>) {
  const { reset, ...rest } = useForm();
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    if (Object.keys(values).length > 0) {
      reset(values);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsReady(true);
    }
  }, [reset, values]);
  return { isReady, ...rest };
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
