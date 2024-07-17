/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { useMemo } from 'react';
import { useProject } from '../api';
import {
  countChildren,
  findCard,
  flattenTree,
  getMoveableCards,
} from '../utils';

/**
 * Helper for getting a list of cards from a project
 * Should be replaced by an approriate API call
 *
 */
export function useListCard(key: string) {
  const { project } = useProject();

  const listCard = useMemo(() => {
    return project ? findCard(project.cards, key) : null;
  }, [project, key]);

  return listCard;
}
/**
 * Helper for getting the amount of children of a card
 * @param key
 * @returns
 */
export function useChildAmount(key: string) {
  const listCard = useListCard(key);

  const childAmount = useMemo(() => {
    return listCard ? countChildren(listCard) : 0;
  }, [listCard]);

  return childAmount;
}

export function useFlatCards() {
  const { project } = useProject();

  const flatCards = useMemo(() => {
    return project ? flattenTree(project.cards) : [];
  }, [project]);

  return flatCards;
}

/**
 * Helper for getting a list of cards that the given card can be moved to
 * @param key  The key of the card to move
 * @returns A list of cards that the given card can be moved to
 */
export function useMoveableCards(key: string) {
  const flatCards = useFlatCards();
  const listCard = useListCard(key);

  const moveableCards = useMemo(() => {
    return listCard ? getMoveableCards(flatCards, listCard) : [];
  }, [flatCards, listCard]);

  return moveableCards;
}
