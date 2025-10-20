import { render, fireEvent } from '@testing-library/react';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import AsciiDocToolbar from '@/components/AsciiDocToolbar';

const createEditor = (doc = '') => {
  const parent = document.createElement('div');
  document.body.appendChild(parent);

  const state = EditorState.create({
    doc,
  });

  const view = new EditorView({
    state,
    parent,
  });

  return { parent, view };
};

const renderToolbar = ({
  doc = '',
  readOnly,
}: {
  doc?: string;
  readOnly?: boolean;
} = {}) => {
  const { view, parent } = createEditor(doc);
  const renderResult = render(
    <AsciiDocToolbar view={view} readOnly={readOnly} />,
  );

  const buttons = renderResult.getAllByRole('button');

  const cleanup = () => {
    renderResult.unmount();
    view.destroy();
    parent.remove();
  };

  return { view, buttons, cleanup };
};

const buttonIndex = {
  undo: 0,
  redo: 1,
  heading1: 2,
  heading2: 3,
  heading3: 4,
  bullet: 5,
  numbered: 6,
  bold: 7,
  italic: 8,
  highlight: 9,
  table: 10,
};

const basicCases = [
  {
    name: 'wraps the current selection in bold markers',
    button: buttonIndex.bold,
    initialDoc: 'text',
    selection: EditorSelection.range(0, 4),
    expectedDoc: '*text*',
    expectedSelection: EditorSelection.cursor(6),
  },
  {
    name: 'inserts bold markers at the cursor position if there is no selection',
    button: buttonIndex.bold,
    initialDoc: 'text',
    selection: EditorSelection.cursor(2),
    expectedDoc: 'te*bold text*xt',
    expectedSelection: EditorSelection.range(3, 12),
  },
  {
    name: 'wraps the current selection in italic markers',
    button: buttonIndex.italic,
    initialDoc: 'text',
    selection: EditorSelection.range(0, 4),
    expectedDoc: '_text_',
    expectedSelection: EditorSelection.cursor(6),
  },
  {
    name: 'inserts italic markers at the cursor position if there is no selection',
    button: buttonIndex.italic,
    initialDoc: 'text',
    selection: EditorSelection.cursor(2),
    expectedDoc: 'te_italic text_xt',
    expectedSelection: EditorSelection.range(3, 14),
  },
  {
    name: 'wraps the current selection in highlight markers',
    button: buttonIndex.highlight,
    initialDoc: 'text',
    selection: EditorSelection.range(0, 4),
    expectedDoc: '#text#',
    expectedSelection: EditorSelection.cursor(6),
  },
  {
    name: 'inserts highlight markers at the cursor position if there is no selection',
    button: buttonIndex.highlight,
    initialDoc: 'text',
    selection: EditorSelection.cursor(2),
    expectedDoc: 'te#highlighted text#xt',
    expectedSelection: EditorSelection.range(3, 19),
  },
  {
    name: 'transforms the current lines to a bulleted list',
    button: buttonIndex.bullet,
    initialDoc: 'line 1\nline 2',
    selection: EditorSelection.range(0, 12),
    expectedDoc: '* line 1\n* line 2',
    expectedSelection: EditorSelection.cursor(17),
  },
  {
    name: 'creates a bulleted list item at the cursor position if there is no selection',
    button: buttonIndex.bullet,
    initialDoc: 'text',
    selection: EditorSelection.cursor(2),
    expectedDoc: 'te* Item 1\n* Item 2\nxt',
    expectedSelection: EditorSelection.cursor(20),
  },
  {
    name: 'transforms the current lines to a numbered list',
    button: buttonIndex.numbered,
    initialDoc: 'line 1\nline 2',
    selection: EditorSelection.range(0, 12),
    expectedDoc: '. line 1\n. line 2',
    expectedSelection: EditorSelection.cursor(17),
  },
  {
    name: 'creates a numbered list item at the cursor position if there is no selection',
    button: buttonIndex.numbered,
    initialDoc: 'text',
    selection: EditorSelection.cursor(2),
    expectedDoc: 'te. Item 1\n. Item 2\nxt',
    expectedSelection: EditorSelection.cursor(20),
  },
  ...[1, 2, 3].map((level) => ({
    name: `transforms the current line to a heading level ${level}`,
    button: buttonIndex.heading1 + (level - 1),
    initialDoc: 'text',
    selection: EditorSelection.range(0, 4),
    expectedDoc: `${'='.repeat(level + 1)} text`,
    expectedSelection: EditorSelection.cursor(level + 6),
  })),
  {
    name: 'updates existing heading to requested level when cursor is on heading line',
    button: buttonIndex.heading2,
    initialDoc: '== Title',
    selection: EditorSelection.cursor(0),
    expectedDoc: '=== Title',
    expectedSelection: EditorSelection.cursor(9),
  },
  {
    name: 'updates existing heading to requested level when entire heading is selected',
    button: buttonIndex.heading3,
    initialDoc: '== Title',
    selection: EditorSelection.range(0, 8),
    expectedDoc: '==== Title',
    expectedSelection: EditorSelection.cursor(10),
  },
  {
    name: 'updates existing heading on multiple lines to requested level when entire heading is selected',
    button: buttonIndex.heading3,
    initialDoc: '== Title\ntitle',
    selection: EditorSelection.range(0, 14),
    expectedDoc: '==== Title\ntitle',
    expectedSelection: EditorSelection.cursor(16),
  },
  ...[1, 2, 3].map((level) => ({
    name: `transforms current line a heading level ${level} if there is no selection and cursor is at the beginning of a line which has text`,
    button: buttonIndex.heading1 + (level - 1),
    initialDoc: 'text',
    selection: EditorSelection.cursor(0),
    expectedDoc: `${'='.repeat(level + 1)} text`,
    expectedSelection: EditorSelection.cursor(level + 6),
  })),
  ...[1, 2, 3].map((level) => ({
    name: `transforms current line a heading level ${level} if there is no selection and cursor is at the end of a line which has text`,
    button: buttonIndex.heading1 + (level - 1),
    initialDoc: 'text',
    selection: EditorSelection.cursor(4),
    expectedDoc: `${'='.repeat(level + 1)} text`,
    expectedSelection: EditorSelection.cursor(level + 6),
  })),
  ...[1, 2, 3].map((level) => ({
    name: `transforms current line a heading level ${level} if there is no selection and cursor is in the middle of text`,
    button: buttonIndex.heading1 + (level - 1),
    initialDoc: 'text',
    selection: EditorSelection.cursor(2),
    expectedDoc: `${'='.repeat(level + 1)} text`,
    expectedSelection: EditorSelection.cursor(level + 6),
  })),
  ...[1, 2, 3].map((level) => ({
    name: `creates a heading level ${level} if there is no selection and line is empty`,
    button: buttonIndex.heading1 + (level - 1),
    initialDoc: '',
    selection: EditorSelection.cursor(0),
    expectedDoc: `${'='.repeat(level + 1)} Heading`,
    expectedSelection: EditorSelection.range(level + 2, level + 9),
  })),

  ...[1, 2, 3].map((level) => ({
    name: `tranforms first line to heading level ${level} if there is selection on multiple lines`,
    button: buttonIndex.heading1 + (level - 1),
    initialDoc: 'text\ntext',
    selection: EditorSelection.range(0, 9),
    expectedDoc: `${'='.repeat(level + 1)} text\ntext`,
    expectedSelection: EditorSelection.cursor(level + 11),
  })),
  {
    name: 'inserts a table at the cursor position',
    button: buttonIndex.table,
    initialDoc: 'text',
    selection: EditorSelection.cursor(2),
    expectedDoc:
      'te\n[cols="1,1"]\n|===\n| Column 1 | Column 2\n\n| Cell in column 1, row 1\n| Cell in column 2, row 1\n\n| Cell in column 1, row 2\n| Cell in column 2, row 2\n|===\nxt',
    expectedSelection: EditorSelection.range(46, 69),
  },
  {
    name: 'inserts a table after selection',
    button: buttonIndex.table,
    initialDoc: 'text',
    selection: EditorSelection.range(0, 4),
    expectedDoc:
      'text\n[cols="1,1"]\n|===\n| Column 1 | Column 2\n\n| Cell in column 1, row 1\n| Cell in column 2, row 1\n\n| Cell in column 1, row 2\n| Cell in column 2, row 2\n|===\n',
    expectedSelection: EditorSelection.range(48, 71),
  },
];

describe('AsciiDocToolbar', () => {
  basicCases.forEach(
    ({
      name,
      button,
      initialDoc,
      selection,
      expectedDoc,
      expectedSelection,
    }) => {
      it(name, () => {
        const { view, buttons, cleanup } = renderToolbar({
          doc: initialDoc,
        });
        try {
          view.dispatch({ selection });
          fireEvent.click(buttons[button]);

          expect(view.state.doc.toString()).toBe(expectedDoc);
          expect(view.state.selection.ranges[0]).toEqual(expectedSelection);
        } finally {
          cleanup();
        }
      });
    },
  );
});
