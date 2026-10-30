// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router';
import type * as SwrLib from 'swr';
import type * as ApiModule from '@/lib/api';

type Card = Record<string, unknown> & {
  deniedOperations: { editField: unknown[]; transition: unknown[] };
};
type Mutations = { updateCard: Mock; updateWorkFlowState: Mock };
let cards: Record<string, Card>;
let mutations: Record<string, Mutations>;
let isEditor = true;

const mutate = vi.fn();
vi.mock('swr', async (importOriginal) => ({
  ...(await importOriginal<typeof SwrLib>()),
  mutate: (...args: unknown[]) => mutate(...args),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  useCard: (key: string) => ({ card: cards[key], error: undefined }),
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

const placeholder = (field: string, showLabel = true, cardKey = 'k_1') =>
  `<card-field options="${btoa(JSON.stringify({ cardKey, field, showLabel }))}"></card-field>`;

function Body({ html, preview = false }: { html: string; preview?: boolean }) {
  return (
    <BrowserRouter>
      <div className="doc">
        {renderCardHtml(html, { macroKey: 'k_1', preview })}
      </div>
    </BrowserRouter>
  );
}

const macro = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-cy="fieldMacro"]')].find(
    (el) => within(el).queryByText(label),
  )!;

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

  beforeEach(() => {
    mutate.mockReset();
    isEditor = true;
    cards = { k_1: cardOf('k_1', 'Card'), k_2: cardOf('k_2', 'Target') };
    mutations = { k_1: spies(), k_2: spies() };
  });

  // A save refetches the body; its macros must not remount and drop drafts.
  it('keeps each open editor and its draft when the body re-renders', () => {
    const html = placeholder('m/fieldTypes/a') + placeholder('m/fieldTypes/b');
    const { rerender } = render(<Body html={html} />);

    fireEvent.click(within(macro('m/fieldTypes/a')).getByText('A'));
    fireEvent.click(within(macro('m/fieldTypes/b')).getByText('B'));
    fireEvent.change(within(macro('m/fieldTypes/a')).getByRole('textbox'), {
      target: { value: 'draft' },
    });

    rerender(<Body html={`${html}`} />);

    expect(within(macro('m/fieldTypes/a')).getByRole('textbox')).toHaveValue(
      'draft',
    );
    expect(within(macro('m/fieldTypes/b')).getByRole('textbox')).toHaveValue(
      'B',
    );
  });

  it.each([
    { showLabel: true, hidden: false },
    { showLabel: false, hidden: true },
  ])(
    'hides the label visually but keeps its name when showLabel is $showLabel',
    ({ showLabel, hidden }) => {
      render(<Body html={placeholder('m/fieldTypes/a', showLabel)} />);
      const label = screen.getByText('m/fieldTypes/a');
      if (hidden) {
        expect(label).toHaveStyle({ width: '1px', height: '1px' });
      } else {
        expect(label).not.toHaveStyle({ width: '1px' });
      }

      fireEvent.click(screen.getByText('A'));

      if (hidden) {
        expect(
          screen.getByRole('textbox', { name: 'm/fieldTypes/a' }),
        ).toBeInTheDocument();
      }
      expect(screen.getByRole('textbox')).toBeInTheDocument();
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

  it.each([
    { role: 'a reader', editor: false, tooltip: 'permissions.editorRequired' },
    { role: 'an editor', editor: true, tooltip: null },
  ])('explains a disabled state selector only to $role', async (row) => {
    isEditor = row.editor;
    render(<Body html={placeholder('workflowState')} />);
    const button = screen.getByRole('button', { name: /Draft/ });

    // Keyboard focus and hover are both ways an editor reaches the selector.
    fireEvent.keyDown(document.body, { key: 'Tab' });
    act(() => button.focus());
    fireEvent.mouseOver(button);

    if (row.tooltip) {
      expect(button).toBeDisabled();
      expect(await screen.findByRole('tooltip')).toHaveTextContent(row.tooltip);
    } else {
      expect(button).toBeEnabled();
      await new Promise((r) => setTimeout(r, 300));
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    }
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
      cross: false,
    },
    {
      name: 'another card',
      field: 'm/fieldTypes/a',
      target: 'k_2',
      edit: editValue,
      save: 'updateCard' as const,
      cross: true,
    },
    {
      name: "another card's state",
      field: 'workflowState',
      target: 'k_2',
      edit: transition,
      save: 'updateWorkFlowState' as const,
      cross: true,
    },
  ])(
    'saves to, labels and refreshes the page only when it edits $name',
    async ({ field, target, edit, save, cross }) => {
      window.history.pushState({}, '', '/projects/TST/cards/k_1');
      render(<Body html={placeholder(field, true, target)} />);

      edit();
      await act(async () => {});

      expect(mutations[target][save]).toHaveBeenCalled();
      const link = screen.queryByRole('link', {
        name: `${target} · ${cards[target].title}`,
      });
      const hostContent = '/api/projects/TST/cards/k_1/content';
      if (cross) {
        expect(mutations.k_1[save]).not.toHaveBeenCalled();
        expect(link).toHaveAttribute('href', `/cards/${target}`);
        expect(mutate).toHaveBeenCalledWith(hostContent);
      } else {
        expect(link).not.toBeInTheDocument();
        expect(mutate).not.toHaveBeenCalledWith(hostContent);
      }
    },
  );

  it.each([
    { on: 'the target', denied: 'k_2', disabled: true },
    { on: 'the page card only', denied: 'k_1', disabled: false },
  ])(
    "takes a target's editability from the target when denied on $on",
    ({ denied, disabled }) => {
      cards[denied].deniedOperations.editField = [
        { fieldName: 'm/fieldTypes/a', errorMessage: 'denied' },
      ];
      render(<Body html={placeholder('m/fieldTypes/a', true, 'k_2')} />);

      fireEvent.click(screen.getByText('A'));

      if (disabled) {
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      } else {
        expect(screen.getByRole('textbox')).toBeInTheDocument();
      }
    },
  );

  it('reports a field the card no longer has', () => {
    render(<Body html={placeholder('m/fieldTypes/gone')} />);

    expect(screen.getByText('fieldMacro.errorTitle')).toBeInTheDocument();
    expect(screen.getByText('fieldMacro.notOnCardType')).toBeInTheDocument();
  });
});
