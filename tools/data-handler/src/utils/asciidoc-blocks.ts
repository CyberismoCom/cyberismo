/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// Listing, literal, passthrough, comment
const VERBATIM_DELIMITER = /^(-{4,}|\.{4,}|\+{4,}|\/{4,})$/;
// Example, sidebar, quote, open, table
const COMPOUND_DELIMITER = /^(={4,}|\*{4,}|_{4,}|--|[|,:!]={3,})$/;
const FENCE_OPENING = /^```[\w+-]*$/;

/**
 * Returns the line that closes the delimited block opened by `line`, or
 * undefined if `line` does not open a delimited block.
 */
function blockTerminator(line: string): string | undefined {
  if (FENCE_OPENING.test(line)) {
    return '```';
  }
  if (VERBATIM_DELIMITER.test(line) || COMPOUND_DELIMITER.test(line)) {
    return line;
  }
  return undefined;
}

/**
 * Returns the line that closes the verbatim block opened by `line`, or
 * undefined if `line` does not open one. Verbatim block content is not parsed
 * as AsciiDoc.
 */
export function verbatimBlockTerminator(line: string): string | undefined {
  const trimmed = line.trimEnd();
  if (FENCE_OPENING.test(trimmed)) {
    return '```';
  }
  return VERBATIM_DELIMITER.test(trimmed) ? trimmed : undefined;
}

/**
 * Closes a delimited block that is still open at the end of `content`.
 *
 * Asciidoctor ends an unterminated block at the end of the document, so a card
 * renders fine on its own. Once cards are concatenated, the block would instead
 * swallow the content that follows it, up to the next matching delimiter.
 * A block's extent is up to the first line equal to its delimiter, so only a
 * top-level block can run past the end of the content.
 */
export function closeUnterminatedBlock(content: string): string {
  const lines = content.split('\n').map((line) => line.trimEnd());
  let index = 0;
  while (index < lines.length) {
    const terminator = blockTerminator(lines[index]);
    if (!terminator) {
      index++;
      continue;
    }
    const end = lines.indexOf(terminator, index + 1);
    if (end === -1) {
      return `${content}${content.endsWith('\n') ? '' : '\n'}${terminator}\n`;
    }
    index = end + 1;
  }
  return content;
}
