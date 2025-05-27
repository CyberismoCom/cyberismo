/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { EditorView } from '@uiw/react-codemirror';
import { apiPaths } from '../swr';
import { CardAttachment } from '@cyberismo/data-handler/interfaces/project-interfaces';
import { Document, Section } from '@asciidoctor/core';

/**
 * Counts the number of empty lines in the codemirror editor in the given direction
 * @param editorView CodeMirror editor, can be obtained from the `useCodeMirror` hook or useRef
 * @param direction The direction to count the empty lines, either 'up' or 'down'
 * @param pos The position to start counting from
 * @param countSelf Whether to count the current line if it is empty.
 * @param maxCount The maximum number of empty lines to count
 * @returns The number of empty lines in the given direction
 */
export function countEmptyLines(
  editorView: EditorView,
  direction: 'up' | 'down',
  pos: number,
  countSelf: boolean = false,
  maxCount: number = 1,
) {
  const currentLine = editorView.state.doc.lineAt(pos);

  const lineNumber = currentLine.number;

  const current = currentLine.length === 0 && countSelf ? 1 : 0;

  if (lineNumber === 1 && direction === 'up') {
    return current;
  }

  if (lineNumber === editorView.state.doc.lines && direction === 'down') {
    return current;
  }

  // if the current line is not empty and we are moving up, or if the current line is not empty and we are moving down
  // then we should return 0
  if (
    (currentLine.length !== 0 &&
      direction === 'up' &&
      !isFirstChar(editorView, pos)) ||
    (currentLine.length !== 0 &&
      direction === 'down' &&
      !isLastChar(editorView, pos))
  ) {
    return 0;
  }

  let count = 0;

  let line = editorView.state.doc.line(
    currentLine.number + (direction === 'up' ? -1 : 1),
  );
  while (line.length === 0 && count < maxCount) {
    count++;

    if (
      (direction === 'up' && line.number === 1) ||
      (direction === 'down' && line.number === editorView.state.doc.lines)
    ) {
      break;
    }
    line = editorView.state.doc.line(
      line.number + (direction === 'up' ? -1 : 1),
    );
  }
  return countSelf && count !== maxCount ? count + current : count;
}

/**
 * Checks if the character at the given position is the given character
 * @param view CodeMirror editor, can be obtained from the `useCodeMirror` hook or useRef
 * @param char The character to check for
 * @param position The position to check
 * @returns True if the character at the given position is the given character and false otherwise
 */
export function hasCharAt(view: EditorView, char: string, position: number) {
  const line = view.state.doc.lineAt(position);
  return line.text[position - line.from] === char;
}

/**
 * Returns true if the given position is the first character in the line
 * @param view CodeMirror editor, can be obtained from the `useCodeMirror` hook or useRef
 * @param position The position to check
 * @returns True if the given position is the first character in the line and false otherwise
 */
export function isFirstChar(view: EditorView, position: number) {
  const line = view.state.doc.lineAt(position);
  return position === line.from;
}

/**
 * Returns true if the given position is the last character in the line
 * @param view CodeMirror editor, can be obtained from the `useCodeMirror` hook or useRef
 * @param position The position to check
 * @returns True if the given position is the last character in the line and false otherwise
 */
export function isLastChar(view: EditorView, position: number) {
  const line = view.state.doc.lineAt(position);
  return position === line.to;
}

/**
 * Adds an attachment to the codemirror editor at the given position.
 * Images are added as images and other types of files are added as links.
 * @param editor The codemirror editor view
 * @param attachment The attachment to add
 * @param cardKey The key of the card that the attachment belongs to
 */
export function addAttachment(
  editor: EditorView,
  { fileName, mimeType }: CardAttachment,
  cardKey: string,
) {
  const target = editor.state.selection.main.to;

  if (mimeType?.startsWith('image')) {
    const newLinesBefore = countEmptyLines(editor, 'up', target, true, 2);

    const hasNewLineAfter = countEmptyLines(editor, 'down', target, true, 1);
    // image requires empty lines before and after
    editor.dispatch({
      changes: {
        from: target,
        insert: `${'\n'.repeat(2 - newLinesBefore)}image::${fileName}[]${hasNewLineAfter ? '' : '\n'}`,
      },
    });
  } else {
    // adds a space before and after the link if there is a character before or after the cursor
    editor.dispatch({
      changes: {
        from: target,
        insert: `${isFirstChar(editor, target) || hasCharAt(editor, ' ', target - 1) ? '' : '\n'}link:${encodeURI(apiPaths.attachment(cardKey, fileName))}["${fileName}",window=_blank]${isLastChar(editor, target) || hasCharAt(editor, ' ', target) ? '' : '\n'}`,
      },
    });
  }
}

/**
 * Tries to locate title of the section being viewed
 * @param view Codemirror editorview instance
 * @param editor HTML Element of codemirror
 * @param doc A parsed asciidoc document
 * @returns Id of the section title if found, otherwise null
 */
export function findCurrentTitleFromADoc(
  view: EditorView,
  editor: HTMLDivElement,
  doc: Document,
) {
  const rect = editor.getBoundingClientRect();

  const pos = view.posAtCoords({
    x: rect.top,
    y: rect.left,
  });

  if (!pos) return null;

  const line = view.state.doc.lineAt(pos);
  // go lines backwards until we find a title
  let title = null;
  for (let i = line.number; i > 0; i--) {
    const line = view.state.doc.line(i);
    // tries to find asciidoc title
    const parsedTitle = line.text.match(/^=+\s*(.*)/);
    if (!parsedTitle || parsedTitle.length < 2) continue;

    // try to match the given title by name
    // We need to trim the end, because asciidoctor also does that
    const section = findSection(doc, parsedTitle[1].trimEnd(), 'name');
    if (section) {
      title = section.getId();
      break;
    }
  }
  return title;
}

/**
 * Finds a section from a document either by title name or id
 * @param doc asciidoc that is being searched
 * @param sectionIdentifier either name or id of the section depending on the 'by' parameter
 * @param by if id, will search by id, otherwise by name. id is the default
 * @returns
 */
export function findSection(
  doc: Document,
  sectionIdentifier: string,
  by: 'id' | 'name' = 'id',
) {
  const sections = doc.getSections();
  return findSectionRecursive(sections, sectionIdentifier, by);
}

function findSectionRecursive(
  sections: Section[],
  sectionIdentifier: string,
  by: 'id' | 'name',
): Section | null {
  for (const section of sections) {
    if (
      (by === 'id' ? section.getId() : section.getName()) === sectionIdentifier
    ) {
      return section;
    }
    const found = findSectionRecursive(
      section.getSections(),
      sectionIdentifier,
      by,
    );
    if (found) {
      return found;
    }
  }
  return null;
}
