/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

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
