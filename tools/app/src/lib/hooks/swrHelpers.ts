// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useMemo } from 'react';
import { useTree } from '../api';
import { countChildren, findCard, getMoveableCards } from '../utils';

/**
 * Helper for getting a list of cards from a project
 * Should be replaced by an approriate API call
 *
 */
export function useListCard(key: string) {
  const { tree } = useTree();

  const listCard = useMemo(() => {
    return tree ? findCard(tree, key) : null;
  }, [tree, key]);

  return listCard;
}
/**
 * Helper for getting the amount of children of a card
 * @param key
 * @returns
 */
export function useChildAmount(key: string) {
  const { tree } = useTree();

  const childAmount = useMemo(() => {
    if (!tree) {
      return 0;
    }
    const card = findCard(tree, key);

    return card ? countChildren(card) : 0;
  }, [tree, key]);

  return childAmount;
}

/**
 * Helper for getting a list of cards that the given card can be moved to
 * @param key  The key of the card to move
 * @returns A list of cards that the given card can be moved to
 */
export function useMoveableCards(key: string) {
  const { tree } = useTree();

  const moveableCards = useMemo(
    () => (tree ? getMoveableCards(tree, key) : null),
    [tree, key],
  );

  return moveableCards;
}
