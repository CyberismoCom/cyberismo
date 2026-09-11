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
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as UtilsModule from '@/lib/utils';
import useSWR, { SWRConfig } from 'swr';
import { ProjectEventsProvider } from '@/lib/contexts/ProjectEventsProvider.js';
import { usePresence } from '@/lib/api/presence.js';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import rootReducer from '@/lib/slices';
import { useCardUpdates } from '@/lib/api/card-updates.js';
import { useSavedDraft } from '@/lib/hooks/savedDraft.js';

const config = vi.hoisted(() => ({ staticMode: false, presenceEnabled: true }));
vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof UtilsModule>()),
  getConfig: () => config,
}));

vi.mock('@/lib/api/user', () => ({
  useUser: () => ({ user: { id: 'me', name: 'Me' } }),
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, ((event: MessageEvent) => void)[]>();
  close = vi.fn();
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, data: unknown = {}) {
    for (const listener of this.listeners.get(type) ?? [])
      listener({ data: JSON.stringify(data) } as MessageEvent);
  }
}
const fetchMock = vi.fn();
beforeEach(() => {
  FakeEventSource.instances = [];
  config.staticMode = false;
  config.presenceEnabled = true;
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup() {
  const store = configureStore({ reducer: rootReducer });
  const cache = new Map();
  let serverContent = 'Saved';
  const fetcher = vi.fn<(key: string) => Promise<string>>(
    async () => serverContent,
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <SWRConfig
        value={{ provider: () => cache, fetcher, dedupingInterval: 0 }}
      >
        <ProjectEventsProvider projectPrefix="TST">
          {children}
        </ProjectEventsProvider>
      </SWRConfig>
    </Provider>
  );
  const hook = renderHook(
    ({ card, mode }: { card: string; mode: 'viewing' | 'editing' }) => {
      const presence = usePresence(card, mode);
      useCardUpdates(card, mode, 'TST');
      const { data } = useSWR<string>(`/api/projects/TST/cards/${card}`);
      const [draft, setDraft] = useSavedDraft(data ?? '');
      useSWR('/api/projects/OTHER/tree');
      return { presence, data, draft, setDraft };
    },
    {
      wrapper,
      initialProps: { card: 'TST_1', mode: 'viewing' as 'viewing' | 'editing' },
    },
  );
  const source = FakeEventSource.instances.at(-1)!;
  return {
    hook,
    source,
    fetcher,
    notifications: () => store.getState().notifications.notifications,
    setContent: (value: string) => {
      serverContent = value;
    },
  };
}
const alice = { userId: 'alice', userName: 'Alice', mode: 'editing' };

describe('project events and presence', () => {
  it('keeps one connection through card and editing changes', async () => {
    const { hook, source } = setup();
    act(() => source.emit('ready', { connectionId: 'one', presence: {} }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    hook.rerender({ card: 'TST_2', mode: 'editing' });
    await waitFor(() =>
      expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toMatchObject({
        connectionId: 'one',
        cardKey: 'TST_2',
        mode: 'editing',
      }),
    );
    const sequences = fetchMock.mock.calls.map(
      (call) => JSON.parse(call[1].body).sequence,
    );
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(source.close).not.toHaveBeenCalled();
    hook.unmount();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it('replaces presence snapshots, clears empty cards, and recovers after disconnect', async () => {
    const { hook, source } = setup();
    act(() =>
      source.emit('ready', {
        connectionId: 'one',
        presence: { TST_1: [alice] },
      }),
    );
    expect(hook.result.current.presence).toEqual([alice]);
    act(() => source.emit('presence.updated', { cardKey: 'TST_1', users: [] }));
    expect(hook.result.current.presence).toEqual([]);
    act(() =>
      source.emit('presence.updated', { cardKey: 'TST_1', users: [alice] }),
    );
    act(() => source.emit('error'));
    expect(hook.result.current.presence).toEqual([]);
    act(() => source.emit('ready', { connectionId: 'two', presence: {} }));
    await waitFor(() =>
      expect(
        JSON.parse(fetchMock.mock.calls.at(-1)![1].body).connectionId,
      ).toBe('two'),
    );
    expect(hook.result.current.presence).toEqual([]);
  });

  it.each(['viewing', 'editing'] as const)(
    'notifies the %s user about the open card and preserves their draft',
    async (mode) => {
      const { hook, source, fetcher, setContent, notifications } = setup();
      await waitFor(() => expect(hook.result.current.data).toBe('Saved'));
      hook.rerender({ card: 'TST_1', mode });
      act(() => hook.result.current.setDraft('Unsaved draft'));
      fetcher.mockClear();
      setContent('Remote edit');
      act(() =>
        source.emit('card.updated', {
          cardKey: 'TST_1',
          userId: 'bob',
          userName: 'Bob',
        }),
      );
      await waitFor(() => expect(hook.result.current.data).toBe('Remote edit'));
      expect(hook.result.current.draft).toBe('Unsaved draft');
      expect(notifications()).toHaveLength(1);
      expect(notifications()[0]).toMatchObject({
        type: mode === 'editing' ? 'warning' : 'info',
      });
      expect(notifications()[0].message).toContain('Bob');
      expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
        '/api/projects/TST/cards/TST_1',
      ]);
      expect(FakeEventSource.instances).toHaveLength(1);
    },
  );

  it('does not notify for own edits or refresh unrelated cards', async () => {
    const { hook, source, fetcher, notifications, setContent } = setup();
    await waitFor(() => expect(hook.result.current.data).toBe('Saved'));
    fetcher.mockClear();
    act(() =>
      source.emit('card.updated', {
        cardKey: 'TST_2',
        userId: 'bob',
        userName: 'Bob',
      }),
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(notifications()).toEqual([]);
    setContent('My edit');
    act(() =>
      source.emit('card.updated', {
        cardKey: 'TST_1',
        userId: 'me',
        userName: 'Me',
      }),
    );
    await waitFor(() => expect(hook.result.current.data).toBe('My edit'));
    expect(notifications()).toEqual([]);
  });

  it('connects and reconnects without invalidating project data', async () => {
    config.presenceEnabled = false;
    const { hook, source, fetcher, notifications } = setup();
    await waitFor(() => expect(hook.result.current.data).toBe('Saved'));
    fetcher.mockClear();
    act(() => {
      source.emit('ready', { connectionId: 'one', presence: {} });
      source.emit('error');
      source.emit('ready', { connectionId: 'two', presence: {} });
      source.emit('card.updated', { invalid: true });
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(notifications()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    act(() =>
      source.emit('card.updated', {
        cardKey: 'TST_1',
        userId: 'bob',
        userName: 'Bob',
      }),
    );
    expect(notifications()[0].message).toContain('Bob');
  });

  it('replaces the connection and clears presence when changing projects', () => {
    let prefix = 'TST';
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ProjectEventsProvider key={prefix} projectPrefix={prefix}>
        {children}
      </ProjectEventsProvider>
    );
    const hook = renderHook(() => usePresence('module_1'), { wrapper });
    const first = FakeEventSource.instances[0];
    act(() =>
      first.emit('ready', {
        connectionId: 'one',
        presence: { module_1: [alice] },
      }),
    );
    expect(hook.result.current).toEqual([alice]);
    prefix = 'OTHER';
    hook.rerender();
    expect(first.close).toHaveBeenCalledOnce();
    expect(FakeEventSource.instances.at(-1)!.url).toBe(
      '/api/projects/OTHER/events',
    );
    expect(hook.result.current).toEqual([]);
    act(() =>
      first.emit('presence.updated', { cardKey: 'module_1', users: [alice] }),
    );
    expect(hook.result.current).toEqual([]);
  });

  it('does not open a stream for static exports', () => {
    config.staticMode = true;
    setup();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('restores the connection after returning from the back-forward cache', () => {
    const { source } = setup();
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(source.close).toHaveBeenCalledOnce();
    act(() => window.dispatchEvent(new Event('pageshow')));
    expect(FakeEventSource.instances).toHaveLength(2);
  });
});
