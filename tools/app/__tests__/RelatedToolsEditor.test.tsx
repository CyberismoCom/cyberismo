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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type * as HooksUtils from '@/lib/hooks/utils';
import type * as Hooks from '@/lib/hooks';

const update = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/api', () => ({
  useResource: () => ({ update, isUpdating: () => false }),
}));

vi.mock('@/lib/hooks', async () => {
  const actual = await vi.importActual<typeof Hooks>('@/lib/hooks');
  return {
    useListItemEditing: actual.useListItemEditing,
    useAppDispatch: () => vi.fn(),
  };
});

vi.mock('@/lib/hooks/utils', async (orig) => ({
  ...(await orig<typeof HooksUtils>()),
  useKeyboardShortcut: () => undefined,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));

import RelatedToolsEditor from '@/components/config-editors/fields/RelatedToolsEditor';

// The row action buttons are icon-only, so they are located by the MUI icon
// they contain rather than by an accessible name.
const iconButton = (icon: string) => {
  const button = screen.getByTestId(icon).closest('button');
  if (!button) throw new Error(`No button found for icon '${icon}'`);
  return button;
};

const skill = (relatedTools: string[]) => ({
  name: 'project/skills/risk',
  displayName: 'Risk',
  relatedTools,
  content: { skillContent: '', skillQuery: '' },
});

describe('RelatedToolsEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an empty state when the skill lists no tools', () => {
    render(<RelatedToolsEditor skill={skill([])} />);
    expect(screen.getByText('noRelatedTools')).toBeInTheDocument();
  });

  it('lists the existing tools', () => {
    render(
      <RelatedToolsEditor skill={skill(['query_cards', 'update_card'])} />,
    );
    expect(screen.getByText('query_cards')).toBeInTheDocument();
    expect(screen.getByText('update_card')).toBeInTheDocument();
  });

  it('adds a tool with an add operation', async () => {
    render(<RelatedToolsEditor skill={skill([])} />);

    fireEvent.change(screen.getByPlaceholderText('relatedToolPlaceholder'), {
      target: { value: '  query_cards  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'add' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith({
      updateKey: { key: 'relatedTools' },
      operation: { name: 'add', target: 'query_cards' },
    });
  });

  it('refuses to add a tool that is already listed', () => {
    render(<RelatedToolsEditor skill={skill(['query_cards'])} />);

    fireEvent.change(screen.getByPlaceholderText('relatedToolPlaceholder'), {
      target: { value: 'query_cards' },
    });

    expect(screen.getByRole('button', { name: 'add' })).toBeDisabled();
    expect(screen.getByText('relatedToolExists')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('removes a tool with a remove operation once confirmed', async () => {
    render(<RelatedToolsEditor skill={skill(['query_cards'])} />);

    fireEvent.click(iconButton('DeleteIcon'));
    fireEvent.click(screen.getByRole('button', { name: 'delete' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith({
      updateKey: { key: 'relatedTools' },
      operation: { name: 'remove', target: 'query_cards' },
    });
  });

  it('renames a tool with a change operation', async () => {
    render(<RelatedToolsEditor skill={skill(['query_cards'])} />);

    fireEvent.click(iconButton('EditIcon'));
    // The add form's input comes first in the DOM; the row's is the second.
    const rowInput = screen.getAllByPlaceholderText(
      'relatedToolPlaceholder',
    )[1];
    fireEvent.change(rowInput, { target: { value: 'create_card' } });
    fireEvent.keyDown(rowInput, { key: 'Enter' });

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith({
      updateKey: { key: 'relatedTools' },
      operation: {
        name: 'change',
        target: 'query_cards',
        to: 'create_card',
      },
    });
  });

  it('saves nothing when read only', () => {
    render(<RelatedToolsEditor skill={skill(['query_cards'])} readOnly />);

    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });
});
