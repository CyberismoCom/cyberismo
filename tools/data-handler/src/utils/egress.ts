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

import type { Dispatcher, RequestInit, Response } from 'undici';

/**
 * Per call rather than `setGlobalDispatcher`, under a non-standard name: both
 * stop a bare `fetch()` in a dependency reaching the internet. Unset means
 * direct connections.
 */
const PROXY_ENV = 'CYBERISMO_EGRESS_PROXY';

let dispatcher: Dispatcher | undefined;
let resolved = false;

async function egressDispatcher(): Promise<Dispatcher | undefined> {
  if (resolved) return dispatcher;
  resolved = true;
  const proxy = process.env[PROXY_ENV]?.trim();
  if (proxy) {
    const { ProxyAgent } = await import('undici');
    dispatcher = new ProxyAgent(proxy);
  }
  return dispatcher;
}

/**
 * `fetch`, routed through the egress proxy when one is configured.
 *
 * undici's own `fetch` rather than the global one: a dispatcher built by the
 * standalone package cannot be handed to the copy of undici bundled inside
 * Node, which fails at run time when their interceptor interfaces differ.
 *
 * @param url Target URL.
 * @param init Standard fetch options.
 */
export async function egressFetch(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const { fetch } = await import('undici');
  const agent = await egressDispatcher();
  return fetch(url, agent ? { ...init, dispatcher: agent } : init);
}

/** Test seam: forget the cached dispatcher so the env can be re-read. */
export function resetEgressDispatcherForTest(): void {
  dispatcher = undefined;
  resolved = false;
}
