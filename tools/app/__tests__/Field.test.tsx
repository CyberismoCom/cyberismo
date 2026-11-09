// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router';

const updateCard = vi.fn();
const updateWorkFlowState = vi.fn();
const notifyError = vi.fn();
let card: Record<string, unknown>;
let isEditor = true;

vi.mock('@/lib/api', () => ({
  useCard: () => ({ card, error: undefined }),
  useCardMutations: () => ({
    updateCard,
    updateWorkFlowState,
    isUpdating: () => false,
  }),
  useProject: () => ({
    project: {
      cardTypes: [{ name: 'm/cardTypes/t', workflow: 'm/workflows/w' }],
      workflows: [
        {
          name: 'm/workflows/w',
          states: [
            { name: 'Draft', category: 'initial' },
            { name: 'Done', category: 'closed' },
          ],
          transitions: [
            { name: 'Finish', fromState: ['Draft'], toState: 'Done' },
          ],
        },
      ],
    },
  }),
}));
vi.mock('@/lib/auth', () => ({
  UserRole: { Reader: 0, Editor: 1, Admin: 2 },
  useHasMinRole: () => isEditor,
}));
vi.mock('@/lib/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof HooksModule>()),
  useAppDispatch: () => vi.fn(),
  // Reports a failure as the real hook does, without a store.
  useErrorNotification: () => async (fn: () => Promise<unknown>) => {
    try {
      return await fn();
    } catch (error) {
      notifyError((error as Error).message);
      return undefined;
    }
  },
}));
import type * as HooksModule from '@/lib/hooks';
vi.mock('@/lib/hooks/theme', () => ({
  useIsDarkMode: vi.fn(() => false),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));

import { renderCardHtml } from '@/components/card/renderCardContent';

const textField = (key: string, value: string) => ({
  key,
  value,
  dataType: 'shortText',
  fieldDisplayName: key,
  fieldDescription: '',
  isCalculated: false,
  isOverridable: false,
  enumValues: [],
});

const placeholder = (
  field: string,
  showLabel = true,
  display: 'row' | 'inline' = 'row',
) =>
  `<card-field options="${btoa(JSON.stringify({ cardKey: 'k_1', field, showLabel, display }))}"></card-field>`;

function Body({ html, preview = false }: { html: string; preview?: boolean }) {
  return (
    <BrowserRouter>
      <div className="doc">
        {renderCardHtml(html, { macroKey: 'k_1', preview })}
      </div>
    </BrowserRouter>
  );
}

describe('Field macro', () => {
  beforeEach(() => {
    updateCard.mockReset();
    updateWorkFlowState.mockReset();
    notifyError.mockReset();
    isEditor = true;
    card = {
      key: 'k_1',
      title: 'Card',
      cardType: 'm/cardTypes/t',
      workflowState: 'Draft',
      fields: [
        textField('m/fieldTypes/a', 'A'),
        textField('m/fieldTypes/b', 'B'),
      ],
      deniedOperations: { editField: [], transition: [] },
    };
  });

  it('keeps the field reachable by its name when the label is hidden', () => {
    render(<Body html={placeholder('m/fieldTypes/a', false)} />);

    expect(screen.getByText('m/fieldTypes/a')).toBeInTheDocument();
    fireEvent.click(screen.getByText('A'));

    // Editing must not drop the name the author's hidden label provides.
    expect(
      screen.getByRole('textbox', { name: 'm/fieldTypes/a' }),
    ).toBeInTheDocument();
    expect(screen.getByText('m/fieldTypes/a')).toBeInTheDocument();
  });

  // Without a label an empty row has nothing else to show or click.
  it.each([
    {
      role: 'an editor',
      editor: true,
      text: 'placeholder.shortText',
      editable: true,
    },
    {
      role: 'a reader',
      editor: false,
      text: 'fieldMacro.empty',
      editable: false,
    },
  ])(
    'shows an empty unlabelled row to $role as "$text"',
    ({ editor, text, editable }) => {
      isEditor = editor;
      card.fields = [textField('m/fieldTypes/a', '')];
      render(<Body html={placeholder('m/fieldTypes/a', false)} />);

      fireEvent.click(screen.getByText(text));

      expect(!!screen.queryByRole('textbox')).toBe(editable);
    },
  );

  it('shows the value read-only in a preview', () => {
    render(<Body html={placeholder('m/fieldTypes/a')} preview />);

    fireEvent.click(screen.getByText('A'));

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('transitions through the state, never as a metadata write', () => {
    render(<Body html={placeholder('workflowState')} />);

    fireEvent.click(screen.getByRole('button', { name: /Draft/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Finish/ }));

    expect(updateWorkFlowState).toHaveBeenCalledWith('Finish');
    expect(updateCard).not.toHaveBeenCalled();
  });

  it('disables a transition the server would refuse', () => {
    card.deniedOperations = {
      editField: [],
      transition: [{ transitionName: 'Finish', errorMessage: 'Not now' }],
    };
    render(<Body html={placeholder('workflowState')} />);

    fireEvent.click(screen.getByRole('button', { name: /Draft/ }));

    expect(screen.getByRole('menuitem', { name: /Finish/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('explains a disabled state selector to a reader', async () => {
    isEditor = false;
    render(<Body html={placeholder('workflowState')} />);
    const button = screen.getByRole('button', { name: /Draft/ });

    // Keyboard focus and hover are both ways to reach the selector.
    fireEvent.keyDown(document.body, { key: 'Tab' });
    button.focus();
    fireEvent.mouseOver(button);

    expect(button).toBeDisabled();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'permissions.editorRequired',
    );
  });

  describe('saving', () => {
    const edit = (shown: string, value: string) => {
      fireEvent.click(screen.getByText(shown));
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value } });
      fireEvent.keyDown(input, { key: 'Enter' });
      return input;
    };

    it.each([
      { display: 'row', field: 'm/fieldTypes/a', shown: 'A' },
      { display: 'inline', field: 'm/fieldTypes/a', shown: 'A' },
      { display: 'row', field: 'title', shown: 'Card' },
    ] as const)(
      'writes $field from a $display edit',
      async ({ display, field, shown }) => {
        render(<Body html={placeholder(field, false, display)} />);

        edit(shown, 'new');

        await waitFor(() =>
          expect(updateCard).toHaveBeenCalledWith({
            metadata: { [field]: 'new' },
          }),
        );
      },
    );

    it('keeps the editor and its draft open when the save fails', async () => {
      updateCard.mockRejectedValue(new Error('Save refused'));
      render(<Body html={placeholder('m/fieldTypes/a', false)} />);

      const input = edit('A', 'draft');

      await waitFor(() =>
        expect(notifyError).toHaveBeenCalledWith('Save refused'),
      );
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('draft');
    });
  });

  it('reports a field the card no longer has', () => {
    render(<Body html={placeholder('m/fieldTypes/gone')} />);

    expect(screen.getByText('fieldMacro.errorTitle')).toBeInTheDocument();
    expect(screen.getByText('fieldMacro.notOnCardType')).toBeInTheDocument();
  });

  describe('row grouping', () => {
    const boxes = () => [
      ...document.querySelectorAll<HTMLElement>('[data-cy="fieldMacro"]'),
    ];
    const a = placeholder('m/fieldTypes/a');
    const b = placeholder('m/fieldTypes/b');

    it('puts two adjacent rows in consecutive grouped boxes', () => {
      render(<Body html={`${a}\n${b}`} />);

      const [first, second] = boxes();
      expect(first.nextElementSibling).toBe(second);
      expect(first).toHaveClass('field-macro-box');
      expect(second).toHaveClass('field-macro-box');
    });

    it('renders workflowState as a labelled row with a state selector', () => {
      render(<Body html={`${a}\n${placeholder('workflowState')}`} />);

      const state = screen.getByRole('group', { name: 'workflowState' });
      expect(screen.getByText('workflowState')).toBeInTheDocument();
      expect(
        within(state).getByRole('button', { name: /Draft/ }),
      ).toBeEnabled();
      expect(state.closest('[data-cy="fieldMacro"]')).toBe(boxes()[1]);
    });
  });

  describe('inline display', () => {
    it.each([
      {
        name: 'a value in a paragraph',
        field: 'm/fieldTypes/a',
        wrap: (m: string) => `<p>Owner is ${m}.</p>`,
        tag: 'P',
      },
      {
        name: 'the state in a paragraph',
        field: 'workflowState',
        wrap: (m: string) => `<p>Now ${m}</p>`,
        tag: 'P',
      },
    ])('renders $name as a span, not a row box', ({ field, wrap, tag }) => {
      render(<Body html={wrap(placeholder(field, false, 'inline'))} />);

      const root = document.querySelector('[data-cy="fieldMacro"]')!;
      expect(root.tagName).toBe('SPAN');
      expect(root.closest('p, td')?.tagName).toBe(tag);
    });

    it('locks an inline field the card denies, with no editor', () => {
      card.deniedOperations = {
        editField: [{ fieldName: 'm/fieldTypes/a', errorMessage: 'Nope' }],
        transition: [],
      };
      render(<Body html={placeholder('m/fieldTypes/a', false, 'inline')} />);

      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.getByTestId('LockOutlinedIcon')).toBeInTheDocument();
    });

    it('adds no text around the value, so punctuation follows it directly', () => {
      render(
        <Body
          html={`<p>Now ${placeholder('m/fieldTypes/a', false, 'inline')}, then.</p>`}
        />,
      );

      expect(document.querySelector('p')).toHaveTextContent('Now A, then.');
    });
  });
});
