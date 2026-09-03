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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';
import type * as SwrModule from 'swr';
import type * as UtilsModule from '@/lib/utils';
import rootReducer from '@/lib/slices';

const mutateMock = vi.fn();
vi.mock('swr', async (importOriginal) => {
  const actual = await importOriginal<typeof SwrModule>();
  return { ...actual, mutate: (...args: unknown[]) => mutateMock(...args) };
});

vi.mock('@/lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof UtilsModule>();
  return {
    ...actual,
    getConfig: () => ({ staticMode: false, presenceEnabled: true }),
  };
});

const currentUser = { id: 'me', email: '', name: 'Me', role: 'editor' };
vi.mock('@/lib/api/user', () => ({
  useUser: () => ({ user: currentUser }),
}));

type Listener = (event: MessageEvent) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  private listeners = new Map<string, Listener[]>();
  close = vi.fn();

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string, data?: unknown) {
    const event = {
      data: data === undefined ? undefined : JSON.stringify(data),
    } as MessageEvent;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

vi.stubGlobal('EventSource', FakeEventSource);

import { usePresence } from '@/lib/api/presence';

const CARD = 'TST_1';
const PREFIX = 'TST';

function setup(mode: 'viewing' | 'editing' = 'viewing') {
  const store = configureStore({ reducer: rootReducer });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(() => usePresence(CARD, mode, PREFIX), { wrapper });
  const source = FakeEventSource.instances.at(-1)!;
  const notifications = () =>
    (
      store.getState() as {
        notifications: {
          notifications: Array<{ type: string; message: string }>;
        };
      }
    ).notifications.notifications;
  return { hook, source, notifications };
}

describe('usePresence card-updated', () => {
  beforeEach(() => {
    mutateMock.mockClear();
    FakeEventSource.instances = [];
    currentUser.role = 'editor';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refetches the card, raw card and trees when someone else saves', () => {
    const { source, notifications } = setup();

    act(() => {
      source.emit('card-updated', {
        cardKey: CARD,
        userId: 'other',
        userName: 'Alex',
      });
    });

    const keys = mutateMock.mock.calls.map((call) => call[0] as string);
    expect(keys.some((k) => k.endsWith(`/cards/${CARD}`))).toBe(true);
    expect(keys.some((k) => k.endsWith(`/cards/${CARD}?raw=true`))).toBe(true);
    // Moves, ranks, titles and states show in the tree as well.
    expect(keys.some((k) => k.endsWith('/tree'))).toBe(true);
    expect(keys.some((k) => k.endsWith('/resources/tree'))).toBe(true);
    expect(notifications()).toHaveLength(1);
    expect(notifications()[0].type).toBe('info');
    expect(notifications()[0].message).toContain('Alex');
  });

  it('warns instead of informing while the local user is editing', () => {
    const { source, notifications } = setup('editing');

    act(() => {
      source.emit('card-updated', {
        cardKey: CARD,
        userId: 'other',
        userName: 'Alex',
      });
    });

    expect(notifications()).toHaveLength(1);
    expect(notifications()[0].type).toBe('warning');
  });

  it("refetches but stays silent for the current user's own save", () => {
    const { source, notifications } = setup();

    act(() => {
      source.emit('card-updated', {
        cardKey: CARD,
        userId: 'me',
        userName: 'Me',
      });
    });

    expect(mutateMock).toHaveBeenCalled();
    expect(notifications()).toHaveLength(0);
  });

  it('ignores a malformed card-updated payload', () => {
    const { source, notifications } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    act(() => {
      source.emit('card-updated', { nope: true });
    });

    expect(mutateMock).not.toHaveBeenCalled();
    expect(notifications()).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
  });

  it('refetches on reconnect but not on the first open', () => {
    const { source } = setup();

    act(() => source.emit('open'));
    expect(mutateMock).not.toHaveBeenCalled();

    act(() => source.emit('open'));
    expect(mutateMock).toHaveBeenCalledTimes(4);
  });

  it('opens the stream for a reader', () => {
    currentUser.role = 'reader';
    setup();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toContain(
      `/cards/${CARD}/presence`,
    );
  });
});
