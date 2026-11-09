// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import { FieldMacroModal } from '@/components/macro-editors';
import '@/lib/i18n';

const cards: Record<string, { fields: object[] }> = {
  host_1: {
    fields: [
      { key: 'test/fieldTypes/owner', fieldDisplayName: 'Owner' },
      { key: 'test/fieldTypes/hidden', fieldDisplayName: 'Hidden one' },
    ],
  },
  other_2: {
    fields: [{ key: 'test/fieldTypes/severity', fieldDisplayName: 'Severity' }],
  },
};

vi.mock('@/lib/api', () => ({
  useCard: (key: string | null) => ({ card: key ? cards[key] : undefined }),
}));

vi.mock('@/lib/api/tree', () => ({
  useTree: () => ({
    tree: [
      { key: 'host_1', title: 'Host' },
      { key: 'other_2', title: 'Other' },
    ],
    isLoading: false,
  }),
}));

const onInsert = vi.fn();
const onClose = vi.fn();

const renderModal = () =>
  render(
    <FieldMacroModal
      open
      onClose={onClose}
      onInsert={onInsert}
      hostCardKey="host_1"
    />,
  );

const dialog = () => within(screen.getByRole('dialog'));
const openFieldSelect = () =>
  fireEvent.click(dialog().getByRole('combobox', { name: /^Field/ }));
const pickField = (name: string) => {
  openFieldSelect();
  fireEvent.click(screen.getByRole('option', { name }));
};
const pickTarget = (name: RegExp) => {
  fireEvent.keyDown(dialog().getByPlaceholderText('This card'), {
    key: 'ArrowDown',
  });
  fireEvent.click(screen.getByRole('option', { name }));
};
const insert = () => fireEvent.click(dialog().getByText('Insert macro'));

describe('FieldMacroModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists title, workflow state and the custom fields of the host card', () => {
    renderModal();
    openFieldSelect();
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['Title', 'Workflow state', 'Owner', 'Hidden one']);
  });

  it('includes cardKey when a target card is chosen', async () => {
    renderModal();
    pickTarget(/Other/);
    pickField('Severity');
    insert();
    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith({
        field: 'test/fieldTypes/severity',
        cardKey: 'other_2',
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it.each([
    { display: 'Row', toggle: false, expected: {} },
    { display: 'Row', toggle: true, expected: { showLabel: false } },
    { display: 'Inline', toggle: false, expected: { display: 'inline' } },
    {
      display: 'Inline',
      toggle: true,
      expected: { display: 'inline', showLabel: true },
    },
  ])(
    'display $display, label toggled: $toggle',
    async ({ display, toggle, expected }) => {
      renderModal();
      pickField('Owner');
      fireEvent.click(dialog().getByRole('combobox', { name: /^Display/ }));
      fireEvent.click(screen.getByRole('option', { name: display }));
      if (toggle) fireEvent.click(dialog().getByLabelText('Show label'));
      insert();
      await waitFor(() =>
        expect(onInsert).toHaveBeenCalledWith({
          field: 'test/fieldTypes/owner',
          ...expected,
        }),
      );
    },
  );

  // Title exists on every card, so only the reset can clear it.
  it('resets the field when the target card changes', () => {
    renderModal();
    pickField('Title');
    expect(dialog().getByText('Insert macro').closest('button')).toBeEnabled();

    pickTarget(/Other/);

    expect(dialog().getByText('Insert macro').closest('button')).toBeDisabled();
  });
});
