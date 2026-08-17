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
import '@testing-library/jest-dom';

const dispatch = vi.fn();
// Keep the real module (CardTitle also imports `formKeyHandler` from
// '@/lib/hooks' and calls it during render — a factory-only mock that
// returns just useAppDispatch would crash with "formKeyHandler is not a
// function") and override only the redux hook.
vi.mock('@/lib/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof HooksModule>();
  return {
    ...actual,
    useAppDispatch: () => dispatch,
  };
});
import type * as HooksModule from '@/lib/hooks';
vi.mock('@/lib/auth', () => ({
  UserRole: { Reader: 0, Editor: 1, Admin: 2 },
  useHasMinRole: () => true,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));

import { CardTitle } from '@/components/card/CardTitle';

describe('CardTitle', () => {
  beforeEach(() => {
    dispatch.mockClear();
  });

  it('saves the edited title when focus leaves the editor', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <CardTitle title="Original" onSave={onSave} />,
    );

    fireEvent.click(screen.getByText('Original'));
    const input = container.querySelector(
      '[data-cy="cardTitleInput"]',
    ) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Edited title' } });

    fireEvent.blur(input);

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        metadata: { title: 'Edited title' },
      }),
    );
  });

  it('does not save on blur when nothing changed', () => {
    const onSave = vi.fn();
    const { container } = render(
      <CardTitle title="Original" onSave={onSave} />,
    );

    fireEvent.click(screen.getByText('Original'));
    fireEvent.blur(container.querySelector('[data-cy="cardTitleInput"]')!);

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Original')).toBeInTheDocument();
  });

  it('keeps the editor open and reports an error instead of silently discarding an emptied title', () => {
    const onSave = vi.fn();
    const { container } = render(
      <CardTitle title="Original" onSave={onSave} />,
    );

    fireEvent.click(screen.getByText('Original'));
    const input = container.querySelector('[data-cy="cardTitleInput"]')!;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(onSave).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-cy="cardTitleInput"]'),
    ).toBeInTheDocument();
  });

  it('keeps the editor open when the save rejects', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('network error'));
    const { container } = render(
      <CardTitle title="Original" onSave={onSave} />,
    );

    fireEvent.click(screen.getByText('Original'));
    const input = container.querySelector('[data-cy="cardTitleInput"]')!;
    fireEvent.change(input, { target: { value: 'Edited title' } });
    fireEvent.blur(input);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(
      container.querySelector('[data-cy="cardTitleInput"]'),
    ).toBeInTheDocument();
  });

  it('the Cancel button still discards the edit, even though clicking it blurs the input first', () => {
    const onSave = vi.fn();
    const { container } = render(
      <CardTitle title="Original" onSave={onSave} />,
    );

    fireEvent.click(screen.getByText('Original'));
    const input = container.querySelector('[data-cy="cardTitleInput"]')!;
    fireEvent.change(input, { target: { value: 'Edited title' } });

    const cancelButton = container.querySelector(
      '[data-cy="cardTitleCancelButton"]',
    )!;
    // A real click fires mousedown before the click that runs handleCancel.
    const notCancelled = fireEvent.mouseDown(cancelButton);
    expect(notCancelled).toBe(false); // preventDefault() was called
    fireEvent.click(cancelButton);

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Original')).toBeInTheDocument();
  });
});
