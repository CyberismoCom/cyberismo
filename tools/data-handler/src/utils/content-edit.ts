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

/**
 * A single find-and-replace edit applied to text content.
 */
export interface ContentEdit {
  /** Exact text to find. Must be non-empty and unique in the content unless replaceAll is set. */
  oldString: string;
  /** Replacement text. */
  newString: string;
  /** Replace every occurrence of oldString instead of requiring a unique match. */
  replaceAll?: boolean;
}

/**
 * Applies find-and-replace edits to text. Edits are applied sequentially, so
 * each edit sees the result of the previous one.
 *
 * Replacement is literal: split/join is used instead of String.replace, so
 * special replacement patterns ($&, $$, $', $`) in newString are never
 * expanded.
 *
 * @param content The text to edit.
 * @param edits Ordered list of find-and-replace edits.
 * @returns The edited text.
 * @throws If the edit list is empty, oldString is empty, equals newString,
 *         is not found, or matches multiple times without replaceAll.
 */
export function applyContentEdits(
  content: string,
  edits: ContentEdit[],
): string {
  if (edits.length === 0) {
    throw new Error('No edits provided');
  }
  for (const [index, edit] of edits.entries()) {
    if (edit.oldString === '') {
      throw new Error(`Edit ${index}: oldString cannot be empty`);
    }
    if (edit.oldString === edit.newString) {
      throw new Error(`Edit ${index}: oldString and newString are identical`);
    }
    // One split serves both occurrence counting and literal replacement.
    const parts = content.split(edit.oldString);
    const occurrences = parts.length - 1;
    if (occurrences === 0) {
      throw new Error(`Edit ${index}: oldString not found in content`);
    }
    if (occurrences > 1 && !edit.replaceAll) {
      throw new Error(
        `Edit ${index}: oldString matches ${occurrences} times; pass replaceAll or add more surrounding context to make it unique`,
      );
    }
    content = parts.join(edit.newString);
  }
  return content;
}
