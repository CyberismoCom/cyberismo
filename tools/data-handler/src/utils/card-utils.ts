/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { sep } from 'node:path';

import { Card } from '../interfaces/project-interfaces.js';

// Helper function to find the parent path from a card path
export const findParentPath = (cardPath: string): string | null => {
  const pathParts = cardPath.split(sep);
  const hasChildren = pathParts.lastIndexOf('c');

  if (hasChildren <= 0) return null;

  const parentPathParts = [...pathParts];
  parentPathParts.splice(hasChildren, 1);
  return parentPathParts.slice(0, hasChildren).join(sep);
};

/**
 * Flattens card tree so that children are shown on same level regardless of nesting level.
 * @param array card tree
 * @returns flattened card tree.
 */
export const flattenCardArray = (array: Card[]) => {
  const result: Card[] = [];
  array.forEach((item) => {
    const { key, path, children, attachments, metadata } = item;
    result.push({ key, path, children, attachments, metadata });
    if (children) {
      result.push(...flattenCardArray(children));
    }
  });
  return result;
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
 * Sorts array of cards first using prefix and then using ID.
 * Prefixes are returned in alphabetical order, and then in numeric order within same prefix.
 * For example, test_za1, test_aa7 and demo_aaa are sorted to: demo_aaa, test_aa7, test_za1.
 * @param a First card to be sorted
 * @param b Second card to be sorted
 * @returns Cards ordered; first by prefixes, then by ID.
 */
export const sortCards = (a: string, b: string) => {
  const aParts = a.split('_');
  const bParts = b.split('_');
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
