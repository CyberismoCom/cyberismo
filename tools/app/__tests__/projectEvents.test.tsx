import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import useSWR, { SWRConfig, mutate } from 'swr';
import type * as UtilsModule from '@/lib/utils';
import { ProjectEventsProvider } from '@/lib/contexts/ProjectEventsProvider';
import { useCardUpdates } from '@/lib/api/card-updates';
import { usePresence } from '@/lib/api/presence';
import { useSavedDraft } from '@/lib/hooks/savedDraft';
import { projectApiPaths } from '@/lib/swr';
import rootReducer from '@/lib/slices';

const config = vi.hoisted(() => ({ staticMode: false }));
vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof UtilsModule>()),
  getConfig: () => config,
}));

const currentUser = vi.hoisted(() => ({
  id: 'me',
  name: 'Me',
  role: 'editor',
}));
vi.mock('@/lib/api/user', () => ({ useUser: () => ({ user: currentUser }) }));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  listeners = new Map<string, ((event: MessageEvent) => void)[]>();
  readyState: number = FakeEventSource.OPEN;
  close = vi.fn(() => {
    this.readyState = FakeEventSource.CLOSED;
  });
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, data: unknown = {}) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

const alice = { userId: 'alice', userName: 'Alice', mode: 'editing' } as const;
const bob = { userId: 'bob', userName: 'Bob', mode: 'viewing' } as const;
const fetchMock = vi.fn();

beforeEach(() => {
  FakeEventSource.instances = [];
  config.staticMode = false;
  currentUser.role = 'editor';
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await new Promise((resolve) => setTimeout(resolve));
  await mutate(() => true, undefined, { revalidate: false });
  vi.unstubAllGlobals();
});

function setup() {
  const store = configureStore({ reducer: rootReducer });
  let saved = 'Saved';
  const fetcher = vi.fn<(key: string) => Promise<string>>(async () => saved);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <SWRConfig value={{ fetcher, dedupingInterval: 0 }}>
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
      const { data: raw } = useSWR<string>(
        `/api/projects/TST/cards/${card}?raw=true`,
      );
      useSWR<string>(projectApiPaths('TST').tree());
      const [draft, setDraft] = useSavedDraft(data ?? '');
      return { presence, data, raw, draft, setDraft };
    },
    {
      wrapper,
      initialProps: { card: 'TST_1', mode: 'viewing' as 'viewing' | 'editing' },
    },
  );
  return {
    hook,
    fetcher,
    source: FakeEventSource.instances.at(-1)!,
    notifications: () => store.getState().notifications.notifications,
    setSaved: (value: string) => {
      saved = value;
    },
  };
}

const lastBody = () => JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
const loaded = (hook: {
  result: { current: { data?: string; raw?: string } };
}) => `${hook.result.current.data}/${hook.result.current.raw}`;
// Drains a promise chain of unknown depth without depending on real time.
async function flushPromises() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('project events and presence', () => {
  it('keeps one connection through card and editing changes', async () => {
    const { hook, source } = setup();
    act(() => source.emit('ready', { connectionId: 'one' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    hook.rerender({ card: 'TST_2', mode: 'editing' });
    await waitFor(() =>
      expect(lastBody()).toMatchObject({
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

  it('replaces presence snapshots and clears on reconnect or disconnect', async () => {
    const { hook, source } = setup();
    act(() => source.emit('ready', { connectionId: 'one' }));
    act(() =>
      source.emit('presence.updated', { cardKey: 'TST_1', users: [alice] }),
    );
    expect(hook.result.current.presence).toEqual([alice]);

    act(() =>
      source.emit('presence.updated', { cardKey: 'TST_1', users: [bob] }),
    );
    expect(hook.result.current.presence).toEqual([bob]);

    act(() => source.emit('presence.updated', { cardKey: 'TST_1', users: [] }));
    expect(hook.result.current.presence).toEqual([]);

    act(() =>
      source.emit('presence.updated', { cardKey: 'TST_1', users: [alice] }),
    );
    act(() => source.emit('ready', { connectionId: 'two' }));
    expect(hook.result.current.presence).toEqual([]);

    act(() =>
      source.emit('presence.updated', { cardKey: 'TST_1', users: [alice] }),
    );
    act(() => source.emit('error'));
    expect(hook.result.current.presence).toEqual([alice]);

    await act(async () => {});
    fetchMock.mockClear();
    act(() => source.emit('ready', { connectionId: 'three' }));
    await waitFor(() => expect(lastBody().connectionId).toBe('three'));
  });

  it('renews presence on hb while a card is held, and not on a timer', () => {
    vi.useFakeTimers();
    try {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ProjectEventsProvider projectPrefix="TST">
          {children}
        </ProjectEventsProvider>
      );
      renderHook(() => usePresence('TST_1'), { wrapper });
      const source = FakeEventSource.instances[0];
      act(() => source.emit('ready', { connectionId: 'one' }));
      fetchMock.mockClear();

      act(() => vi.advanceTimersByTime(60_000));
      expect(fetchMock).not.toHaveBeenCalled();

      act(() => source.emit('hb'));
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(lastBody()).toMatchObject({
        connectionId: 'one',
        cardKey: 'TST_1',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps last-known presence through a transient error, clearing only if no ready follows the window', () => {
    vi.useFakeTimers();
    try {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ProjectEventsProvider projectPrefix="TST">
          {children}
        </ProjectEventsProvider>
      );
      const hook = renderHook(() => usePresence('TST_1'), { wrapper });
      const source = FakeEventSource.instances[0];
      act(() => source.emit('ready', { connectionId: 'one' }));
      act(() =>
        source.emit('presence.updated', { cardKey: 'TST_1', users: [alice] }),
      );
      expect(hook.result.current).toEqual([alice]);

      act(() => source.emit('error'));
      expect(hook.result.current).toEqual([alice]);
      act(() => vi.advanceTimersByTime(5_000));
      expect(hook.result.current).toEqual([alice]);

      // A ready before the window elapses cancels the pending clear.
      act(() => source.emit('ready', { connectionId: 'two' }));
      act(() =>
        source.emit('presence.updated', { cardKey: 'TST_1', users: [bob] }),
      );
      act(() => vi.advanceTimersByTime(6_000));
      expect(hook.result.current).toEqual([bob]);

      act(() => source.emit('error'));
      act(() => vi.advanceTimersByTime(10_000));
      expect(hook.result.current).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('probes auth on a terminal (CLOSED) error and reopens after a backoff once the session checks out', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ProjectEventsProvider projectPrefix="TST">
          {children}
        </ProjectEventsProvider>
      );
      renderHook(() => usePresence('TST_1'), { wrapper });
      const source = FakeEventSource.instances[0];
      act(() => source.emit('ready', { connectionId: 'one' }));
      fetchMock.mockClear();

      // A non-CLOSED error (the browser is retrying on its own) triggers
      // neither a probe nor a manual close.
      act(() => source.emit('error'));
      expect(source.close).not.toHaveBeenCalled();
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes('/auth/me')),
      ).toBe(false);

      // CLOSED means the browser gave up for good (e.g. a fatal HTTP
      // status); probe auth rather than retrying forever silently.
      source.readyState = FakeEventSource.CLOSED;
      act(() => source.emit('error'));
      expect(source.close).toHaveBeenCalledOnce();
      await flushPromises();
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes('/auth/me')),
      ).toBe(true);
      expect(FakeEventSource.instances).toHaveLength(1);

      // The probe (mocked 204, i.e. still authenticated) resolved, so the
      // stream reopens after the backoff instead of staying dead.
      act(() => vi.advanceTimersByTime(3_000));
      expect(FakeEventSource.instances).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never reopens after a terminal error whose auth probe shows the session has actually expired', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(
          new Response(null, {
            status: String(url).includes('/auth/me') ? 401 : 204,
          }),
        ),
      );
      const wrapper = ({ children }: { children: ReactNode }) => (
        <ProjectEventsProvider projectPrefix="TST">
          {children}
        </ProjectEventsProvider>
      );
      renderHook(() => usePresence('TST_1'), { wrapper });
      const source = FakeEventSource.instances[0];
      act(() => source.emit('ready', { connectionId: 'one' }));

      source.readyState = FakeEventSource.CLOSED;
      act(() => source.emit('error'));
      expect(source.close).toHaveBeenCalledOnce();

      // handleResponse's 401 branch never settles its promise (it dispatches
      // the real session-expired banner instead), so nothing ever reopens.
      await flushPromises();
      act(() => vi.advanceTimersByTime(60_000));
      expect(FakeEventSource.instances).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears a left card's stale presence, but not on a same-card mode change", async () => {
    const { hook, source } = setup();
    act(() => source.emit('ready', { connectionId: 'one' }));
    act(() =>
      source.emit('presence.updated', { cardKey: 'TST_1', users: [alice] }),
    );
    expect(hook.result.current.presence).toEqual([alice]);

    hook.rerender({ card: 'TST_1', mode: 'editing' });
    await act(async () => {});
    expect(hook.result.current.presence).toEqual([alice]);

    hook.rerender({ card: 'TST_2', mode: 'editing' });
    await act(async () => {});
    hook.rerender({ card: 'TST_1', mode: 'editing' });
    expect(hook.result.current.presence).toEqual([]);
  });

  it('replaces the connection and clears presence when changing projects', () => {
    let prefix = 'TST';
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ProjectEventsProvider key={prefix} projectPrefix={prefix}>
        {children}
      </ProjectEventsProvider>
    );
    const hook = renderHook(() => usePresence('TST_1'), { wrapper });
    const first = FakeEventSource.instances[0];
    expect(first.url).toBe('/api/projects/TST/events');
    act(() => first.emit('ready', { connectionId: 'one' }));
    act(() =>
      first.emit('presence.updated', { cardKey: 'TST_1', users: [alice] }),
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
      first.emit('presence.updated', { cardKey: 'TST_1', users: [alice] }),
    );
    expect(hook.result.current).toEqual([]);
  });

  it.each(['viewing', 'editing'] as const)(
    'notifies the %s user about the open card and preserves their draft',
    async (mode) => {
      const { hook, source, fetcher, notifications, setSaved } = setup();
      await waitFor(() => expect(loaded(hook)).toBe('Saved/Saved'));
      hook.rerender({ card: 'TST_1', mode });
      act(() => hook.result.current.setDraft('Unsaved draft'));
      fetcher.mockClear();
      setSaved('Remote edit');

      act(() =>
        source.emit('card.updated', {
          cardKey: 'TST_1',
          userId: 'bob',
          userName: 'Bob',
        }),
      );
      await waitFor(() => expect(hook.result.current.data).toBe('Remote edit'));
      expect(hook.result.current.draft).toBe('Unsaved draft');
      expect(fetcher.mock.calls.map((call) => call[0]).sort()).toEqual([
        '/api/projects/TST/cards/TST_1',
        '/api/projects/TST/cards/TST_1?raw=true',
        '/api/projects/TST/tree',
      ]);
      expect(notifications()).toHaveLength(1);
      expect(notifications()[0]).toMatchObject({
        type: mode === 'editing' ? 'warning' : 'info',
        message:
          mode === 'editing'
            ? 'Bob saved changes to this card while you are editing. Your draft is unchanged.'
            : 'Bob updated this card',
      });
    },
  );

  it('does not notify for own edits or refresh unrelated cards', async () => {
    const { hook, source, fetcher, notifications, setSaved } = setup();
    await waitFor(() => expect(loaded(hook)).toBe('Saved/Saved'));
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

    setSaved('My own edit');
    act(() =>
      source.emit('card.updated', {
        cardKey: 'TST_1',
        userId: 'me',
        userName: 'Me',
      }),
    );
    await waitFor(() => expect(hook.result.current.data).toBe('My own edit'));
    expect(notifications()).toEqual([]);
  });

  it('refreshes the open card for a reader without a toast', async () => {
    currentUser.role = 'reader';
    const { hook, source, notifications, setSaved } = setup();
    await waitFor(() => expect(loaded(hook)).toBe('Saved/Saved'));
    setSaved('Remote edit');

    act(() =>
      source.emit('card.updated', {
        cardKey: 'TST_1',
        userId: 'bob',
        userName: 'Bob',
      }),
    );
    await waitFor(() => expect(hook.result.current.data).toBe('Remote edit'));
    expect(notifications()).toEqual([]);
  });

  it('refreshes for a reader even when the server omits identity', async () => {
    currentUser.role = 'reader';
    const { hook, source, setSaved } = setup();
    await waitFor(() => expect(loaded(hook)).toBe('Saved/Saved'));
    setSaved('Remote edit');

    act(() => source.emit('card.updated', { cardKey: 'TST_1' }));
    await waitFor(() => expect(hook.result.current.data).toBe('Remote edit'));
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

  it('connects and reconnects without invalidating project data', async () => {
    const { hook, source, fetcher, notifications } = setup();
    await waitFor(() => expect(loaded(hook)).toBe('Saved/Saved'));
    fetcher.mockClear();

    act(() => {
      source.emit('ready', { connectionId: 'one' });
      source.emit('error');
      source.emit('ready', { connectionId: 'two' });
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(notifications()).toEqual([]);

    act(() =>
      source.emit('card.updated', {
        cardKey: 'TST_1',
        userId: 'bob',
        userName: 'Bob',
      }),
    );
    expect(notifications()[0].message).toBe('Bob updated this card');
  });
});
