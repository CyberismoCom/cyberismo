// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import type { Notification } from '@/lib/slices/notifications';

const dispatch = vi.fn();
let notifications: Notification[] = [];

vi.mock('@/lib/hooks', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (
    select: (state: { notifications: { notifications: Notification[] } }) => [],
  ) => select({ notifications: { notifications } }),
}));

import { Notifications } from '@/components/Notifications';

const toast = (extra: Partial<Notification> = {}): Notification => ({
  id: 'n1',
  message: 'Done',
  type: 'success',
  closed: false,
  createdAt: Date.now(),
  disableAutoClose: false,
  ...extra,
});
const closed = () =>
  dispatch.mock.calls.some(
    ([action]) => action.type === 'notifications/closeNotification',
  );
// Past the success timeout, and past the clickaway grace period.
const later = () => act(() => vi.advanceTimersByTime(20_000));

beforeEach(() => {
  vi.useFakeTimers();
  dispatch.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Notifications', () => {
  it('closes a toast without links on its own', () => {
    notifications = [toast()];
    render(<Notifications navigate={vi.fn()} />);

    later();

    expect(closed()).toBe(true);
  });

  it('keeps a toast with links open, also on an outside click', () => {
    notifications = [
      toast({ links: [{ label: 'New card', href: '/projects/p/cards/p_1' }] }),
    ];
    render(<Notifications navigate={vi.fn()} />);

    later();
    fireEvent.click(document.body);

    expect(closed()).toBe(false);
    fireEvent.click(document.querySelector('[data-cy="notificationClose"]')!);
    expect(closed()).toBe(true);
  });

  it('opens a link in the app, and leaves a modified click to the browser', () => {
    const navigate = vi.fn();
    notifications = [
      toast({
        links: [{ label: 'New card', href: '/projects/p/cards/p_1' }],
        more: 'and 2 more',
      }),
    ];
    render(<Notifications navigate={navigate} />);

    const link = screen.getByRole('link', { name: 'New card' });
    fireEvent.click(link, { ctrlKey: true });
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(link);
    expect(navigate).toHaveBeenCalledWith('/projects/p/cards/p_1');
    expect(screen.getByText(/and 2 more/)).toBeInTheDocument();
  });
});
