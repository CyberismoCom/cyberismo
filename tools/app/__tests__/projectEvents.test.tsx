import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import useSWR, { SWRConfig } from 'swr';
import type * as UtilsModule from '@/lib/utils';
import { ProjectEventsProvider } from '@/lib/contexts/ProjectEventsProvider';
import { usePresence } from '@/lib/api/presence';

const config = vi.hoisted(() => ({ staticMode: false, presenceEnabled: true }));
vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof UtilsModule>()),
  getConfig: () => config,
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
  const cache = new Map();
  const fetcher = vi.fn<(key: string) => Promise<string>>(async () => 'Saved');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SWRConfig value={{ provider: () => cache, fetcher, dedupingInterval: 0 }}>
      <ProjectEventsProvider projectPrefix="TST">
        {children}
      </ProjectEventsProvider>
    </SWRConfig>
  );
  const hook = renderHook(
    ({ card, mode }: { card: string; mode: 'viewing' | 'editing' }) => {
      const presence = usePresence(card, mode);
      const { data } = useSWR<string>(`/api/projects/TST/cards/${card}`);
      return { presence, data };
    },
    {
      wrapper,
      initialProps: { card: 'TST_1', mode: 'viewing' as 'viewing' | 'editing' },
    },
  );
  return { hook, fetcher, source: FakeEventSource.instances.at(-1)! };
}

const lastBody = () => JSON.parse(fetchMock.mock.calls.at(-1)![1].body);

describe('project events and presence', () => {
  it('keeps one connection through card and editing changes', async () => {
    const { hook, source } = setup();
    act(() => source.emit('ready', { connectionId: 'one', presence: {} }));
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

  it('replaces presence snapshots and recovers after disconnect', async () => {
    const { hook, source } = setup();
    act(() =>
      source.emit('ready', {
        connectionId: 'one',
        presence: { TST_1: [alice] },
      }),
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
    act(() => source.emit('ready', { connectionId: 'two', presence: {} }));
    expect(hook.result.current.presence).toEqual([]);

    act(() =>
      source.emit('presence.updated', { cardKey: 'TST_1', users: [alice] }),
    );
    act(() => source.emit('error'));
    expect(hook.result.current.presence).toEqual([]);

    await act(async () => {});
    fetchMock.mockClear();
    act(() => source.emit('ready', { connectionId: 'three', presence: {} }));
    await waitFor(() => expect(lastBody().connectionId).toBe('three'));
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
    act(() =>
      first.emit('ready', {
        connectionId: 'one',
        presence: { TST_1: [alice] },
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
      first.emit('presence.updated', { cardKey: 'TST_1', users: [alice] }),
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

  it('connects and reconnects without invalidating project data', async () => {
    config.presenceEnabled = false;
    const { hook, source, fetcher } = setup();
    await waitFor(() => expect(hook.result.current.data).toBe('Saved'));
    fetcher.mockClear();

    act(() => {
      source.emit('ready', { connectionId: 'one', presence: {} });
      source.emit('error');
      source.emit('ready', { connectionId: 'two', presence: {} });
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
