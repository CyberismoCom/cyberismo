/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// The Playwright suite picks templates with `.locator('.templateCard')` in six
// places, and those tests cannot run in this environment. This pins the class
// so a refactor of the card cannot quietly break them.

vi.mock('@/lib/api', () => ({
  useTemplates: () => ({
    templates: [
      {
        name: 'base/templates/page',
        displayName: 'Page',
        category: 'Pages',
        description: 'An empty page',
      },
      {
        name: 'base/templates/decision',
        displayName: 'Decision',
        category: 'Records',
        description: 'A decision record',
      },
    ],
  }),
  useCard: () => ({
    createCard: vi.fn(),
    card: null,
    isUpdating: () => false,
  }),
}));

vi.mock('@/lib/hooks', () => ({
  useAppDispatch: () => vi.fn(),
  useAppRouter: () => ({ push: vi.fn() }),
}));

const { NewCardModal } = await import('@/components/modals/NewCardModal');

describe('NewCardModal template picker', () => {
  it('keeps the templateCard hook the e2e suite selects on', () => {
    render(<NewCardModal open onClose={vi.fn()} cardKey="base_1" />);

    const cards = document.querySelectorAll('.templateCard');
    expect(cards).toHaveLength(2);
    expect(screen.getByText('Page')).toBeInTheDocument();
    expect(screen.getByText('Decision')).toBeInTheDocument();
  });

  it('groups templates under their category', () => {
    render(<NewCardModal open onClose={vi.fn()} cardKey="base_1" />);

    expect(screen.getByText('Pages')).toBeInTheDocument();
    expect(screen.getByText('Records')).toBeInTheDocument();
  });
});
