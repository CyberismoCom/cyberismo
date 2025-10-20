/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { redo, undo } from '@codemirror/commands';

const BULLET_LIST_PLACEHOLDER = '* Item 1\n* Item 2\n';
const NUMBERED_LIST_PLACEHOLDER = '. Item 1\n. Item 2\n';
const HEADING_PLACEHOLDER = 'Heading';
const BOLD_PLACEHOLDER = 'bold text';
const ITALIC_PLACEHOLDER = 'italic text';
const HIGHLIGHT_PLACEHOLDER = 'highlighted text';

type MaybeEditorView = EditorView | null | undefined;

const withEditableView = (
  view: MaybeEditorView,
  readOnly: boolean | undefined,
  operation: (cmView: EditorView) => void,
) => {
  if (!view || readOnly) {
    return;
  }
  operation(view);
  view.focus();
};

const wrapSelection = (
  view: EditorView,
  left: string,
  right: string,
  placeholder: string,
) => {
  const { state } = view;
  const selection = state.selection.main;

  if (selection.empty) {
    const insert = `${left}${placeholder}${right}`;
    const from = selection.from;
    view.dispatch({
      changes: { from, to: selection.to, insert },
      selection: EditorSelection.range(
        from + left.length,
        from + left.length + placeholder.length,
      ),
    });
    return;
  }

  const { from, to } = selection;
  const selectedText = state.doc.sliceString(from, to);
  const insert = `${left}${selectedText}${right}`;
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(from + insert.length),
  });
};

const applyHeadingToSelection = (view: EditorView, level: 1 | 2 | 3) => {
  const { state } = view;
  const selection = state.selection.main;
  const headingMarker = '='.repeat(level + 1);
  const headingText = HEADING_PLACEHOLDER;
  const titleStartOffset = headingMarker.length + 1;

  const normalizeLine = (lineText: string) => {
    const trimmed = lineText.trim();
    const match = trimmed.match(/^(=+)\s*(.*)$/);
    return {
      title: match ? (match[2] ?? '').trim() : trimmed,
      isHeading: Boolean(match),
    } as const;
  };

  const selectForHeading = (
    headingStart: number,
    titleLength: number,
    usePlaceholder: boolean,
    offset: number,
  ) =>
    usePlaceholder
      ? EditorSelection.range(
          headingStart + titleStartOffset,
          headingStart + titleStartOffset + titleLength,
        )
      : EditorSelection.cursor(
          headingStart + titleStartOffset + titleLength + offset,
        );

  const line = state.doc.lineAt(selection.from);
  const lineStart = line.from;
  const lineEnd = line.to;
  const isMultiline = selection.to > line.to;
  const lineText = state.doc.sliceString(lineStart, lineEnd);
  const { title: normalizedTitle } = normalizeLine(lineText);
  const usePlaceholder = normalizedTitle === '';
  const title = usePlaceholder ? headingText : normalizedTitle;
  const insert = `${headingMarker} ${title}`;

  view.dispatch({
    changes: { from: lineStart, to: lineEnd, insert },
    selection: selectForHeading(
      lineStart,
      title.length,
      usePlaceholder,
      isMultiline ? selection.to - line.to : 0,
    ),
  });
};

const transformToList = (
  view: EditorView,
  marker: '*' | '.',
  placeholder: string,
) => {
  const { state } = view;
  const selection = state.selection.main;

  if (selection.empty) {
    const insertPosition = selection.from;
    view.dispatch({
      changes: { from: insertPosition, to: selection.to, insert: placeholder },
      selection: EditorSelection.cursor(insertPosition + placeholder.length),
    });
    return;
  }

  const { from, to } = selection;
  const startLine = state.doc.lineAt(from);
  const endLineCandidate = state.doc.lineAt(to);
  const endLine =
    to > 0 && to === endLineCandidate.from && to !== state.doc.length
      ? state.doc.lineAt(to - 1)
      : endLineCandidate;

  const rangeFrom = startLine.from;
  const rangeTo = endLine.to;
  const selectedText = state.doc.sliceString(rangeFrom, rangeTo);
  const markerWithSpace = `${marker} `;

  const lines = selectedText.split('\n');
  const transformed = lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return line;
      }
      const leadingWhitespace = line.slice(0, line.indexOf(trimmed));
      if (trimmed.startsWith(markerWithSpace)) {
        return line;
      }
      const withoutExistingMarker = trimmed.replace(/^([*\.]\s+)/, '');
      return `${leadingWhitespace}${markerWithSpace}${withoutExistingMarker}`;
    })
    .join('\n');

  view.dispatch({
    changes: { from: rangeFrom, to: rangeTo, insert: transformed },
    selection: EditorSelection.cursor(rangeFrom + transformed.length),
  });
};

const insertTable = (view: EditorView) => {
  const { state } = view;
  const selection = state.selection.main;
  const tableSnippet = `[cols="1,1"]
|===
| Column 1 | Column 2

| Cell in column 1, row 1
| Cell in column 2, row 1

| Cell in column 1, row 2
| Cell in column 2, row 2
|===
`;
  const insertPosition = selection.to;
  const needsNewline =
    insertPosition > 0 &&
    state.doc.sliceString(insertPosition - 1, insertPosition) !== '\n';
  const insert = `${needsNewline ? '\n' : ''}${tableSnippet}`;
  const focusTarget = 'Cell in column 1, row 1';
  const focusOffset =
    (needsNewline ? 1 : 0) + tableSnippet.indexOf(focusTarget);
  const cursorStart = insertPosition + focusOffset;
  const cursorEnd = cursorStart + focusTarget.length;

  view.dispatch({
    changes: { from: insertPosition, to: insertPosition, insert },
    selection: EditorSelection.range(cursorStart, cursorEnd),
  });
};

export const asciiDocToolbarActions = {
  undo(view: MaybeEditorView, readOnly?: boolean) {
    withEditableView(view, readOnly, (cmView) => {
      undo(cmView);
    });
  },
  redo(view: MaybeEditorView, readOnly?: boolean) {
    withEditableView(view, readOnly, (cmView) => {
      redo(cmView);
    });
  },
  heading(view: MaybeEditorView, level: 1 | 2 | 3, readOnly?: boolean) {
    withEditableView(view, readOnly, (cmView) => {
      applyHeadingToSelection(cmView, level);
    });
  },
  bold(view: MaybeEditorView, readOnly?: boolean) {
    withEditableView(view, readOnly, (cmView) => {
      wrapSelection(cmView, '*', '*', BOLD_PLACEHOLDER);
    });
  },
  italic(view: MaybeEditorView, readOnly?: boolean) {
    withEditableView(view, readOnly, (cmView) => {
      wrapSelection(cmView, '_', '_', ITALIC_PLACEHOLDER);
    });
  },
  highlight(view: MaybeEditorView, readOnly?: boolean) {
    withEditableView(view, readOnly, (cmView) => {
      wrapSelection(cmView, '#', '#', HIGHLIGHT_PLACEHOLDER);
    });
  },
  bulletedList(view: MaybeEditorView, readOnly?: boolean) {
    withEditableView(view, readOnly, (cmView) => {
      transformToList(cmView, '*', BULLET_LIST_PLACEHOLDER);
    });
  },
  numberedList(view: MaybeEditorView, readOnly?: boolean) {
    withEditableView(view, readOnly, (cmView) => {
      transformToList(cmView, '.', NUMBERED_LIST_PLACEHOLDER);
    });
  },
  table(view: MaybeEditorView, readOnly?: boolean) {
    withEditableView(view, readOnly, (cmView) => {
      insertTable(cmView);
    });
  },
};

export type AsciiDocToolbarActions = typeof asciiDocToolbarActions;
