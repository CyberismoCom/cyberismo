// The point of routing outbound traffic per call rather than through
// setGlobalDispatcher is that a plain `fetch()`, in our code or inside any
// dependency, has no route out. These pin that.
//
// Nothing here is mocked. A real proxy is what makes the tests meaningful: the
// dispatcher has to work, not merely be passed. That is what the undici 8 bump
// broke, when a dispatcher built by the standalone package was handed to the
// copy bundled inside Node and every proxied request failed with "invalid
// onRequestStart method". A stub accepts any dispatcher and sees nothing.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';

/** One request the proxy handled, however it was asked to. */
interface Handled {
  target: string;
  auth: string | null;
}

const REQUEST_TIMEOUT_MS = 5000;
const CREDENTIALS = { user: 'git', password: 'tok' };

let origin: http.Server;
let proxy: http.Server;
let originUrl: string;
let proxyUrl: string;
let handled: Handled[];

function port(server: http.Server): number {
  return (server.address() as AddressInfo).port;
}

function listen(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

beforeEach(async () => {
  handled = [];

  origin = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ from: 'origin', path: request.url }));
  });

  // Both mechanisms, because which one undici picks is its business and has
  // changed between major versions: 7 tunnels an http target with CONNECT,
  // 8 forwards it as an ordinary request with an absolute target.
  proxy = http.createServer((request, response) => {
    handled.push({
      target: request.url ?? '',
      auth: request.headers['proxy-authorization'] ?? null,
    });
    const upstream = http.request(
      request.url ?? '',
      { method: request.method, headers: request.headers },
      (upstreamResponse) => {
        response.writeHead(
          upstreamResponse.statusCode ?? 502,
          upstreamResponse.headers,
        );
        upstreamResponse.pipe(response);
      },
    );
    upstream.on('error', () => response.writeHead(502).end());
    request.pipe(upstream);
  });
  proxy.on('connect', (request, client, head) => {
    handled.push({
      target: request.url ?? '',
      auth: request.headers['proxy-authorization'] ?? null,
    });
    const [host, targetPort] = (request.url ?? '').split(':');
    const upstream = net.connect(Number(targetPort), host, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => client.destroy());
  });

  await listen(origin);
  await listen(proxy);
  originUrl = `http://127.0.0.1:${port(origin)}/moduleList.json`;
  proxyUrl = `http://${CREDENTIALS.user}:${CREDENTIALS.password}@127.0.0.1:${port(proxy)}`;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await resetEgressDispatcherForTest();
  await Promise.all([close(origin), close(proxy)]);
});

const { egressFetch, resetEgressDispatcherForTest } =
  await import('../src/utils/egress.js');

/** Fetches the origin and asserts it answered, returning the parsed body. */
async function get(): Promise<unknown> {
  const response = await egressFetch(originUrl, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  expect(response.ok).toBe(true);
  return response.json();
}

const body = { from: 'origin', path: '/moduleList.json' };

describe('egressFetch', () => {
  it('reaches the origin through the configured proxy', async () => {
    vi.stubEnv('CYBERISMO_EGRESS_PROXY', proxyUrl);

    expect(await get()).toEqual(body);
    expect(handled).toHaveLength(1);
    expect(handled[0].target).toContain(`127.0.0.1:${port(origin)}`);
    // Credentials reach the proxy, rather than the request going out
    // unauthenticated and being refused in production.
    const { user, password } = CREDENTIALS;
    expect(handled[0].auth).toBe(
      `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
    );
  });

  it('connects directly when no proxy is configured', async () => {
    // Local runs and the CLI depend on this path.
    expect(await get()).toEqual(body);
    expect(handled).toEqual([]);
  });

  it('ignores HTTPS_PROXY, which is what libraries auto-detect', async () => {
    vi.stubEnv('HTTPS_PROXY', proxyUrl);

    expect(await get()).toEqual(body);
    expect(handled).toEqual([]);
  });

  it('leaves the global dispatcher alone', async () => {
    // If this ever set a global dispatcher, every fetch in the process,
    // including one in a malicious dependency, would reach the internet.
    const key = Symbol.for('undici.globalDispatcher.1');
    const before = (globalThis as Record<symbol, unknown>)[key];

    vi.stubEnv('CYBERISMO_EGRESS_PROXY', proxyUrl);
    await get();

    expect((globalThis as Record<symbol, unknown>)[key]).toBe(before);
  });
});
