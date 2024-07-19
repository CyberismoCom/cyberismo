import { EditorView } from '@uiw/react-codemirror';
import { Attachment, CardAttachment } from '../definitions';
import { apiPaths } from '../swr';

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
  attachment: Attachment,
  cardKey: string,
) {
  const target = editor.state.selection.main.to;

  if (attachment.type === 'image') {
    const newLinesBefore = countEmptyLines(editor, 'up', target, true, 2);

    const hasNewLineAfter = countEmptyLines(editor, 'down', target, true, 1);
    // image requires empty lines before and after
    editor.dispatch({
      changes: {
        from: target,
        insert: `${'\n'.repeat(2 - newLinesBefore)}image::${apiPaths.attachment(cardKey, attachment.fileName)}[]${hasNewLineAfter ? '' : '\n'}`,
      },
    });
  } else {
    // adds a space before and after the link if there is a character before or after the cursor
    editor.dispatch({
      changes: {
        from: target,
        insert: `${isFirstChar(editor, target) || hasCharAt(editor, ' ', target - 1) ? '' : ' '}link:${encodeURI(apiPaths.attachment(cardKey, attachment.fileName))}[${attachment.fileName}]${isLastChar(editor, target) || hasCharAt(editor, ' ', target) ? '' : ' '}`,
      },
    });
  }
}
