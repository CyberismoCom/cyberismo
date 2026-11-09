// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router';
import type * as SwrLib from 'swr';
import type * as ApiModule from '@/lib/api';

type Card = Record<string, unknown> & {
  deniedOperations: { editField: unknown[]; transition: unknown[] };
};
type Mutations = { updateCard: Mock; updateWorkFlowState: Mock };
const notifyError = vi.fn();
let cards: Record<string, Card>;
let errors: Record<string, Error>;
let mutations: Record<string, Mutations>;
let isEditor = true;

const mutate = vi.fn();
vi.mock('swr', async (importOriginal) => ({
  ...(await importOriginal<typeof SwrLib>()),
  mutate: (...args: unknown[]) => mutate(...args),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  useCard: (key: string) => ({ card: cards[key], error: errors[key] }),
  useCardMutations: (key: string) => ({
    ...mutations[key],
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
  cardKey = 'k_1',
) =>
  `<card-field options="${btoa(JSON.stringify({ cardKey, field, showLabel, display }))}"></card-field>`;

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
  const cardOf = (key: string, title: string): Card => ({
    key,
    title,
    cardType: 'm/cardTypes/t',
    workflowState: 'Draft',
    fields: [
      textField('m/fieldTypes/a', 'A'),
      textField('m/fieldTypes/b', 'B'),
    ],
    deniedOperations: { editField: [], transition: [] },
  });
  const spies = () => ({
    updateCard: vi.fn(),
    updateWorkFlowState: vi.fn(),
  });

  afterEach(() => window.history.pushState({}, '', '/'));

  beforeEach(() => {
    notifyError.mockReset();
    mutate.mockReset();
    isEditor = true;
    cards = { k_1: cardOf('k_1', 'Card'), k_2: cardOf('k_2', 'Target') };
    mutations = { k_1: spies(), k_2: spies() };
    errors = {};
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
      cards.k_1.fields = [textField('m/fieldTypes/a', '')];
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

    expect(mutations.k_1.updateWorkFlowState).toHaveBeenCalledWith('Finish');
    expect(mutations.k_1.updateCard).not.toHaveBeenCalled();
  });

  it('disables a transition the server would refuse', () => {
    cards.k_1.deniedOperations = {
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
          expect(mutations.k_1.updateCard).toHaveBeenCalledWith({
            metadata: { [field]: 'new' },
          }),
        );
      },
    );

    it('keeps the editor and its draft open when the save fails', async () => {
      mutations.k_1.updateCard.mockRejectedValue(new Error('Save refused'));
      render(<Body html={placeholder('m/fieldTypes/a', false)} />);

      const input = edit('A', 'draft');

      await waitFor(() =>
        expect(notifyError).toHaveBeenCalledWith('Save refused'),
      );
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('draft');
    });
  });

  const editValue = () => {
    fireEvent.click(screen.getByText('A'));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'new' },
    });
    fireEvent.click(document.querySelector('[data-cy="fieldSaveButton"]')!);
  };
  const transition = () => {
    fireEvent.click(screen.getByRole('button', { name: /Draft/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Finish/ }));
  };

  // k_1 is the page's card. A macro in an included card targets that card.
  it.each([
    {
      name: 'its own card',
      field: 'm/fieldTypes/a',
      target: 'k_1',
      edit: editValue,
      save: 'updateCard' as const,
      args: [{ metadata: { 'm/fieldTypes/a': 'new' } }],
      cross: false,
    },
    {
      name: 'another card',
      field: 'm/fieldTypes/a',
      target: 'k_2',
      edit: editValue,
      save: 'updateCard' as const,
      args: [{ metadata: { 'm/fieldTypes/a': 'new' } }],
      cross: true,
    },
    {
      name: "another card's state",
      field: 'workflowState',
      target: 'k_2',
      edit: transition,
      save: 'updateWorkFlowState' as const,
      args: ['Finish'],
      cross: true,
    },
  ])(
    'saves to, labels and refreshes the page only when it edits $name',
    async ({ field, target, edit, save, args, cross }) => {
      window.history.pushState({}, '', '/projects/TST/cards/k_1');
      render(<Body html={placeholder(field, true, 'row', target)} />);

      edit();
      // The page refresh follows the save; the own-card editor closes after it.
      await waitFor(() =>
        cross
          ? expect(mutate).toHaveBeenCalled()
          : expect(screen.queryByRole('textbox')).not.toBeInTheDocument(),
      );

      expect(mutations[target][save]).toHaveBeenCalledWith(...args);
      const link = screen.queryByRole('link', {
        name: `${target} · ${cards[target].title}`,
      });
      const base = '/api/projects/TST';
      const matcher = mutate.mock.calls
        .map(([arg]) => arg)
        .find((arg) => typeof arg === 'function');
      if (cross) {
        expect(mutations.k_1[save]).not.toHaveBeenCalled();
        expect(link).toHaveAttribute('href', `/cards/${target}`);
        // The host's data and content, and any other mounted card's; nothing else.
        expect(matcher(`${base}/cards/k_1`)).toBe(true);
        expect(matcher(`${base}/cards/k_1/content`)).toBe(true);
        expect(matcher(`${base}/cards/k_3`)).toBe(true);
        expect(matcher(`${base}/cards/k_1/source`)).toBe(false);
        expect(matcher(`${base}/cards/k_1/a`)).toBe(false);
        expect(matcher(`${base}/tree`)).toBe(false);
        expect(matcher(`/api/projects/OTHER/cards/k_1`)).toBe(false);
      } else {
        expect(link).not.toBeInTheDocument();
        expect(matcher).toBeUndefined();
      }
    },
  );

  it('names an inline target in a tooltip and keeps its link out of the sentence', async () => {
    render(
      <Body
        html={`<p>Owner is ${placeholder('m/fieldTypes/a', false, 'inline', 'k_2')}.</p>`}
      />,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(document.querySelector('p > [data-cy="fieldMacro"]')).toBeTruthy();
    fireEvent.mouseOver(screen.getByRole('button', { name: /A/ }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'k_2 · Target',
    );
  });

  it('names an inline target state in a tooltip', async () => {
    render(
      <Body
        html={`<p>Now ${placeholder('workflowState', false, 'inline', 'k_2')}.</p>`}
      />,
    );

    fireEvent.mouseOver(screen.getByRole('button', { name: /Draft/ }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'k_2 · Target',
    );
  });

  it.each([
    { on: 'the target', denied: 'k_2', disabled: true },
    { on: 'the page card only', denied: 'k_1', disabled: false },
  ])(
    "takes a target's editability from the target when denied on $on",
    ({ denied, disabled }) => {
      cards[denied].deniedOperations.editField = [
        { fieldName: 'm/fieldTypes/a', errorMessage: 'denied' },
      ];
      render(<Body html={placeholder('m/fieldTypes/a', true, 'row', 'k_2')} />);

      fireEvent.click(screen.getByText('A'));

      if (disabled) {
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      } else {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      }
    },
  );

  describe("when another card's load fails", () => {
    const html = `${placeholder('m/fieldTypes/a', true, 'row', 'k_2')}\n${placeholder('m/fieldTypes/b')}`;

    it('shows the error in its place and leaves other macros working', () => {
      delete cards.k_2;
      errors.k_2 = new Error('boom');
      render(<Body html={html} />);

      expect(screen.getByText('fieldMacro.errorTitle')).toBeInTheDocument();
      expect(screen.getByText('B')).toBeInTheDocument();
    });

    it('renders nothing for it while the card is not loaded', () => {
      delete cards.k_2;
      render(<Body html={html} />);

      expect(
        screen.queryByText('fieldMacro.errorTitle'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('A')).not.toBeInTheDocument();
      expect(screen.getByText('B')).toBeInTheDocument();
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

    it("breaks the group around another card's row, which has its link above it", () => {
      const other = placeholder('m/fieldTypes/a', true, 'row', 'k_2');
      render(<Body html={`${a}\n${other}\n${b}`} />);

      const [first, second] = boxes();
      expect(first.nextElementSibling).not.toBe(second);
      expect(second.previousElementSibling).toBe(
        screen.getByRole('link', { name: 'k_2 · Target' }),
      );
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
      cards.k_1.deniedOperations = {
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
