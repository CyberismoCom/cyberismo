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
  { dialog: 'card', Modal: ExportCardModal },
  { dialog: 'project', Modal: ExportProjectModal },
])('the $dialog export dialog', ({ Modal }) => {
  it('exports the hidden cards only when asked', () => {
    render(<Modal open onClose={vi.fn()} cardKey="test_1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByLabelText('Include hidden cards'));
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(
      exportCard.mock.calls.map(([params]) => params.includeHidden),
    ).toEqual([false, true]);
    exportCard.mockClear();
  });
});
