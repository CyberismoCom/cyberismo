// The point of routing outbound traffic per call rather than through
// setGlobalDispatcher is that a plain `fetch()` — in our code or inside any
// dependency — has no route out. These pin that.

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  egressFetch,
  resetEgressDispatcherForTest,
} from '../src/utils/egress.js';

/** `dispatcher` is an undici extension, absent from the DOM RequestInit. */
type ProxiedInit = RequestInit & { dispatcher?: unknown };

/** Typed so `mock.calls[0][1]` is the init object rather than a tuple of none. */
function fetchSpy() {
  return vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(
    async () => new Response('ok'),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEgressDispatcherForTest();
});

describe('egressFetch', () => {
  it('passes a dispatcher when a proxy is configured', async () => {
    vi.stubEnv('CYBERISMO_EGRESS_PROXY', 'http://git:tok@proxy:3128');
    const spy = fetchSpy();
    vi.stubGlobal('fetch', spy);

    await egressFetch('https://hub.example/moduleList.json');

    const init = spy.mock.calls[0][1] as ProxiedInit;
    expect(init.dispatcher).toBeDefined();
  });

  it('leaves the global dispatcher alone', async () => {
    // If this ever set a global dispatcher, every fetch in the process —
    // including one in a malicious dependency — would reach the internet.
    const globalDispatcher = Symbol.for('undici.globalDispatcher.1');
    const before = (globalThis as Record<symbol, unknown>)[globalDispatcher];

    vi.stubEnv('CYBERISMO_EGRESS_PROXY', 'http://git:tok@proxy:3128');
    vi.stubGlobal('fetch', fetchSpy());
    await egressFetch('https://hub.example/moduleList.json');

    expect((globalThis as Record<symbol, unknown>)[globalDispatcher]).toBe(
      before,
    );
  });

  it('ignores HTTPS_PROXY, which is what libraries auto-detect', async () => {
    // Also covers the unproxied path: no dispatcher means a direct call, which
    // is what local runs and the CLI depend on.
    vi.stubEnv('HTTPS_PROXY', 'http://git:tok@proxy:3128');
    const spy = fetchSpy();
    vi.stubGlobal('fetch', spy);

    await egressFetch('https://hub.example/moduleList.json');

    const init = spy.mock.calls[0][1] as ProxiedInit | undefined;
    expect(init?.dispatcher).toBeUndefined();
  });
});
