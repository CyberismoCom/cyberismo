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

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type * as SwrModule from 'swr';

const mutateMock = vi.fn();
vi.mock('swr', async (importOriginal) => {
  const actual = await importOriginal<typeof SwrModule>();
  return { ...actual, mutate: (...args: unknown[]) => mutateMock(...args) };
});

vi.mock('@/lib/api/user', () => ({
  useUser: () => ({
    user: { id: 'me', email: '', name: 'Me', role: 'editor' },
  }),
}));

import { useRefetchCardOnPresenceChange } from '@/lib/api/presence';
import type { PresenceEntry } from '@/lib/api/presence';

const editing = (userId: string): PresenceEntry => ({
  userId,
  userName: userId,
  mode: 'editing',
});
const viewing = (userId: string): PresenceEntry => ({
  userId,
  userName: userId,
  mode: 'viewing',
});

const renderPresence = (initial: PresenceEntry[]) =>
  renderHook(
    ({ presence }: { presence: PresenceEntry[] }) =>
      useRefetchCardOnPresenceChange(presence, 'TST_1', 'TST'),
    { initialProps: { presence: initial } },
  );

describe('useRefetchCardOnPresenceChange', () => {
  beforeEach(() => {
    mutateMock.mockClear();
  });

  it('refetches the card when another user stops editing', () => {
    const { rerender } = renderPresence([editing('other')]);

    rerender({ presence: [viewing('other')] });

    expect(mutateMock).toHaveBeenCalledWith('/api/projects/TST/cards/TST_1');
    expect(mutateMock).toHaveBeenCalledWith(
      '/api/projects/TST/cards/TST_1?raw=true',
    );
  });

  it('refetches when an editing user disconnects without switching mode', () => {
    const { rerender } = renderPresence([editing('other')]);

    // Closing the tab drops the presence entry; the backend does not emit a
    // 'viewing' entry for it.
    rerender({ presence: [] });

    expect(mutateMock).toHaveBeenCalledWith('/api/projects/TST/cards/TST_1');
  });

  it('ignores the local user finishing their own edit', () => {
    const { rerender } = renderPresence([editing('me')]);

    rerender({ presence: [viewing('me')] });

    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('waits for the last other editor before refetching', () => {
    const { rerender } = renderPresence([editing('a'), editing('b')]);

    rerender({ presence: [viewing('a'), editing('b')] });
    expect(mutateMock).not.toHaveBeenCalled();

    rerender({ presence: [viewing('a'), viewing('b')] });
    // One refetch: card + rawCard.
    expect(mutateMock).toHaveBeenCalledTimes(2);
  });

  it('does not refetch while nobody else has been editing', () => {
    const { rerender } = renderPresence([viewing('other')]);

    rerender({ presence: [] });
    rerender({ presence: [viewing('other'), viewing('another')] });

    expect(mutateMock).not.toHaveBeenCalled();
  });
});
