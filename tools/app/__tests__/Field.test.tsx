// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router';

const updateCard = vi.fn();
const updateWorkFlowState = vi.fn();
let card: Record<string, unknown>;

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
  useHasMinRole: () => true,
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

const placeholder = (field: string) =>
  `<card-field options="${btoa(JSON.stringify({ cardKey: 'k_1', field, showLabel: true }))}"></card-field>`;

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
  beforeEach(() => {
    updateCard.mockReset();
    updateWorkFlowState.mockReset();
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

  it('reports a field the card no longer has', () => {
    render(<Body html={placeholder('m/fieldTypes/gone')} />);

    expect(screen.getByText('fieldMacro.errorTitle')).toBeInTheDocument();
    expect(screen.getByText('fieldMacro.noValue')).toBeInTheDocument();
  });
});
