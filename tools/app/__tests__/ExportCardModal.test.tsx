// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import '@/lib/i18n';

const exportCard = vi.fn();

vi.mock('@/lib/api/card', () => ({
  useCard: () => ({ card: { title: 'Card' } }),
  useCardExport: () => ({ exportCard }),
}));

vi.mock('@/lib/api/project', () => ({
  useProject: () => ({ project: { name: 'Project' } }),
}));

const { ExportCardModal, ExportProjectModal } =
  await import('@/components/modals/ExportCardModal');

describe.each([
  { dialog: 'card', Modal: ExportCardModal, withChildren: true },
  { dialog: 'project', Modal: ExportProjectModal, withChildren: false },
])('the $dialog export dialog', ({ Modal, withChildren }) => {
  it('exports the hidden cards only when asked', () => {
    render(<Modal open onClose={vi.fn()} cardKey="test_1" />);
    const exportChildren = () =>
      withChildren &&
      fireEvent.click(screen.getByLabelText('Export child cards'));

    exportChildren();
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    exportChildren();
    fireEvent.click(screen.getByLabelText('Include hidden cards'));
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(
      exportCard.mock.calls.map(([params]) => params.includeHidden),
    ).toEqual([false, true]);
    exportCard.mockClear();
  });
});

describe('the card export dialog without child cards', () => {
  it('offers the hidden cards only with the child cards, and drops them without', () => {
    render(<ExportCardModal open onClose={vi.fn()} cardKey="test_1" />);
    const includeHidden = () => screen.getByLabelText('Include hidden cards');

    expect(includeHidden()).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Export child cards'));
    expect(includeHidden()).toBeEnabled();
    fireEvent.click(includeHidden());
    fireEvent.click(screen.getByLabelText('Export child cards'));
    expect(includeHidden()).toBeDisabled();
    expect(includeHidden()).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(exportCard).toHaveBeenLastCalledWith(
      expect.objectContaining({
        exportChildCards: false,
        includeHidden: false,
      }),
    );
  });
});
