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

/** What a project file is, when it belongs to a card. */
export interface CardFile {
  key: string;
  /** The card's folder, relative to the project. */
  cardPath: string;
  /** Key of the parent card, or 'root' for a top-level card. */
  parent: string;
  /** Template name, for a template card. */
  template?: string;
  role: 'metadata' | 'content' | 'attachment' | 'other';
  /** File name, for an attachment. */
  attachment?: string;
}

const TEMPLATES = ['.cards', 'local', 'templates'];

/**
 * Identifies the card a project file belongs to, from its path alone.
 * Project cards live under 'cardRoot/<key>', children under '<card>/c/<key>',
 * attachments under '<card>/a/'; template cards under
 * '.cards/local/templates/<template>/c/<key>'.
 * @param path Project-relative path, with '/' separators.
 * @returns the card and the file's role in it, or undefined for a file that
 *   is not inside a card folder.
 */
export function cardFileOf(path: string): CardFile | undefined {
  const segments = path.split('/');
  let prefixLength: number;
  let template: string | undefined;
  if (segments[0] === 'cardRoot') {
    prefixLength = 1;
  } else if (
    TEMPLATES.every((segment, i) => segments[i] === segment) &&
    segments[4] === 'c'
  ) {
    template = segments[3];
    prefixLength = 5;
  } else {
    return undefined;
  }
  const rest = segments.slice(prefixLength);
  // A card folder holds at least one file: key + file name
  if (rest.length < 2) {
    return undefined;
  }
  let keyIndex = 0;
  let parent = 'root';
  // '<key>/c/<child>/…': descend while a child card folder follows
  while (rest[keyIndex + 1] === 'c' && keyIndex + 3 < rest.length) {
    parent = rest[keyIndex];
    keyIndex += 2;
  }
  const key = rest[keyIndex];
  const inside = rest.slice(keyIndex + 1);
  const cardPath = [
    ...segments.slice(0, prefixLength),
    ...rest.slice(0, keyIndex + 1),
  ].join('/');
  const base = { key, cardPath, parent, ...(template ? { template } : {}) };
  if (inside.length === 1 && inside[0] === 'index.json') {
    return { ...base, role: 'metadata' };
  }
  if (inside.length === 1 && inside[0] === 'index.adoc') {
    return { ...base, role: 'content' };
  }
  if (inside[0] === 'a' && inside.length > 1) {
    return {
      ...base,
      role: 'attachment',
      attachment: inside.slice(1).join('/'),
    };
  }
  return { ...base, role: 'other' };
}
