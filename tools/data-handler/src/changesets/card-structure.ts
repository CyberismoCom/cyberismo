/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { cardFileOf } from './card-paths.js';

// '<parent>/c/<key>' → '<parent>', when the parent is itself a card folder
function parentCardPath(cardPath: string): string | undefined {
  const segments = cardPath.split('/');
  if (segments.length < 3 || segments[segments.length - 2] !== 'c') {
    return undefined;
  }
  const parent = segments.slice(0, -2).join('/');
  return cardFileOf(`${parent}/index.json`)?.cardPath === parent
    ? parent
    : undefined;
}

/**
 * Card folders that are not whole cards: they, or cards below them, hold
 * files, but they lack their own metadata or content. Git merges files, not
 * cards, so a merge of two valid trees can leave these behind, e.g. when one
 * side deletes a card and the other adds a child to it.
 * @param files Project-relative paths of every file in the tree.
 * @returns the broken card folders, parents before children.
 */
export function brokenCards(files: string[]): string[] {
  const own = new Map<string, Set<string>>();
  const folders = new Set<string>();
  for (const file of files) {
    const card = cardFileOf(file);
    if (!card) continue;
    if (card.role === 'metadata' || card.role === 'content') {
      own.set(
        card.cardPath,
        (own.get(card.cardPath) ?? new Set()).add(card.role),
      );
    }
    for (
      let path: string | undefined = card.cardPath;
      path;
      path = parentCardPath(path)
    ) {
      folders.add(path);
    }
  }
  return [...folders]
    .filter((path) => own.get(path)?.size !== 2)
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
}

/**
 * Card keys held by a tree.
 * @param files Project-relative paths of every file in the tree.
 */
export function cardKeys(files: string[]): Set<string> {
  return new Set(
    files.flatMap((file) => {
      const card = cardFileOf(file);
      return card?.role === 'metadata' ? [card.key] : [];
    }),
  );
}
