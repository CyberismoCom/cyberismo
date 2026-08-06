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

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type * as SwrModule from 'swr';

const mutateMock = vi.fn();
vi.mock('swr', async (importOriginal) => {
  const actual = await importOriginal<typeof SwrModule>();
  return { ...actual, mutate: (...args: unknown[]) => mutateMock(...args) };
});

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

describe('useRefetchCardOnPresenceChange', () => {
  beforeEach(() => {
    mutateMock.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refetches the card when another user stops editing', () => {
    const { rerender } = renderHook(
      ({ presence }: { presence: PresenceEntry[] }) =>
        useRefetchCardOnPresenceChange(presence, 'me', 'TST_1', true, 'TST'),
      { initialProps: { presence: [editing('other')] } },
    );

    rerender({ presence: [viewing('other')] });
    vi.advanceTimersByTime(500);

    expect(mutateMock).toHaveBeenCalledWith('/api/projects/TST/cards/TST_1');
    expect(mutateMock).toHaveBeenCalledWith(
      '/api/projects/TST/cards/TST_1?raw=true',
    );
  });

  it('ignores the local user finishing their own edit', () => {
    const { rerender } = renderHook(
      ({ presence }: { presence: PresenceEntry[] }) =>
        useRefetchCardOnPresenceChange(presence, 'me', 'TST_1', true, 'TST'),
      { initialProps: { presence: [editing('me')] } },
    );

    rerender({ presence: [viewing('me')] });
    vi.advanceTimersByTime(500);

    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const { rerender } = renderHook(
      ({ presence }: { presence: PresenceEntry[] }) =>
        useRefetchCardOnPresenceChange(presence, 'me', 'TST_1', false, 'TST'),
      { initialProps: { presence: [editing('other')] } },
    );

    rerender({ presence: [viewing('other')] });
    vi.advanceTimersByTime(500);

    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('a reconnect blip (presence list going empty) does not itself trigger a refetch', () => {
    const { rerender } = renderHook(
      ({ presence }: { presence: PresenceEntry[] }) =>
        useRefetchCardOnPresenceChange(presence, 'me', 'TST_1', true, 'TST'),
      { initialProps: { presence: [editing('other')] } },
    );

    // Local EventSource reconnect (e.g. this user's own mode changed) blips
    // the list to empty before the new connection repopulates it.
    rerender({ presence: [] });
    rerender({ presence: [editing('other')] });
    vi.advanceTimersByTime(500);

    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('collapses two rapid transitions into a single refetch', () => {
    const { rerender } = renderHook(
      ({ presence }: { presence: PresenceEntry[] }) =>
        useRefetchCardOnPresenceChange(presence, 'me', 'TST_1', true, 'TST'),
      { initialProps: { presence: [editing('a'), editing('b')] } },
    );

    rerender({ presence: [viewing('a'), editing('b')] });
    vi.advanceTimersByTime(100);
    rerender({ presence: [viewing('a'), viewing('b')] });
    vi.advanceTimersByTime(500);

    // One refetch (card + rawCard = 2 mutate calls), not two.
    expect(mutateMock).toHaveBeenCalledTimes(2);
  });
});
