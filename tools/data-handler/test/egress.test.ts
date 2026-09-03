// The point of routing outbound traffic per call rather than through
// setGlobalDispatcher is that a plain `fetch()` — in our code or inside any
// dependency — has no route out. These pin that.
//
// undici is mocked rather than the global fetch, because egressFetch uses
// undici's own fetch: a dispatcher from the standalone package cannot be handed
// to the copy bundled inside Node.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Undici from 'undici';

const fetchMock =
  vi.fn<(url: string | URL, init?: UndiciInit) => Promise<{ ok: boolean }>>();

vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof Undici>();
  return { ...actual, fetch: fetchMock };
});

const { egressFetch, resetEgressDispatcherForTest } =
  await import('../src/utils/egress.js');

/** `dispatcher` is an undici extension, absent from the DOM RequestInit. */
type UndiciInit = RequestInit & { dispatcher?: unknown };

afterEach(() => {
  vi.unstubAllEnvs();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true });
  resetEgressDispatcherForTest();
});

describe('egressFetch', () => {
  it('passes a dispatcher when a proxy is configured', async () => {
    vi.stubEnv('CYBERISMO_EGRESS_PROXY', 'http://git:tok@proxy:3128');
    fetchMock.mockResolvedValue({ ok: true });

    await egressFetch('https://hub.example/moduleList.json');

    expect(fetchMock.mock.calls[0][1]?.dispatcher).toBeDefined();
  });

  it('leaves the global dispatcher alone', async () => {
    // If this ever set a global dispatcher, every fetch in the process —
    // including one in a malicious dependency — would reach the internet.
    const globalDispatcher = Symbol.for('undici.globalDispatcher.1');
    const before = (globalThis as Record<symbol, unknown>)[globalDispatcher];

    vi.stubEnv('CYBERISMO_EGRESS_PROXY', 'http://git:tok@proxy:3128');
    fetchMock.mockResolvedValue({ ok: true });
    await egressFetch('https://hub.example/moduleList.json');

    expect((globalThis as Record<symbol, unknown>)[globalDispatcher]).toBe(
      before,
    );
  });

  it('ignores HTTPS_PROXY, which is what libraries auto-detect', async () => {
    // Also covers the unproxied path: no dispatcher means a direct call, which
    // is what local runs and the CLI depend on.
    vi.stubEnv('HTTPS_PROXY', 'http://git:tok@proxy:3128');
    fetchMock.mockResolvedValue({ ok: true });

    await egressFetch('https://hub.example/moduleList.json');

    expect(fetchMock.mock.calls[0][1]?.dispatcher).toBeUndefined();
  });

  it('does not fall back to the global fetch', async () => {
    // The bug this file exists to prevent: a dispatcher built by the standalone
    // undici handed to Node's bundled one fails at run time.
    const globalSpy = vi.fn();
    vi.stubGlobal('fetch', globalSpy);
    vi.stubEnv('CYBERISMO_EGRESS_PROXY', 'http://git:tok@proxy:3128');
    fetchMock.mockResolvedValue({ ok: true });

    await egressFetch('https://hub.example/moduleList.json');

    expect(globalSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
