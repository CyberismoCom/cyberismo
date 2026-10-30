// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { QueryResult } from '@cyberismo/model';
import { callApi, createApiCallError } from '../swr';
import { getConfig } from '../utils';

type Row = QueryResult<'card'>;
type Waiter = { resolve: (row: Row) => void; reject: (error: unknown) => void };

// Matches the backend's batch limit.
const MAX_KEYS = 100;

// Pending card reads per project cards path, flushed on the next macrotask.
const queues = new Map<string, Map<string, Waiter[]>>();

/**
 * SWR fetcher for `card(key)`. Reads issued before the next macrotask share
 * one batch POST; each still resolves to its own card.
 */
export function cardFetcher(url: string): Promise<Row> {
  // The static site serves files only.
  if (getConfig().staticMode) {
    return callApi<Row>(url, 'GET');
  }
  const split = url.lastIndexOf('/');
  const cards = url.slice(0, split);
  const key = url.slice(split + 1);
  let queue = queues.get(cards);
  if (!queue) {
    queue = new Map();
    queues.set(cards, queue);
    setTimeout(() => flush(cards), 0);
  }
  const waiters = queue.get(key) ?? [];
  queue.set(key, waiters);
  return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
}

function settle(waiters: Waiter[], row: Promise<Row>) {
  row.then(
    (value) => waiters.forEach((waiter) => waiter.resolve(value)),
    (error) => waiters.forEach((waiter) => waiter.reject(error)),
  );
}

// The error GET gives for a key the project does not hold.
async function notFound(key: string): Promise<never> {
  throw await createApiCallError(
    new Response(
      JSON.stringify({ error: `Card ${key} not found from project` }),
      { status: 400 },
    ),
  );
}

function flush(cards: string) {
  const queue = queues.get(cards)!;
  queues.delete(cards);
  const keys = [...queue.keys()];
  if (keys.length === 1) {
    settle(queue.get(keys[0])!, callApi<Row>(`${cards}/${keys[0]}`, 'GET'));
    return;
  }
  for (let start = 0; start < keys.length; start += MAX_KEYS) {
    const chunk = keys.slice(start, start + MAX_KEYS);
    const rows = callApi<Record<string, Row>>(`${cards}/batch`, 'POST', {
      keys: chunk,
    });
    for (const key of chunk) {
      settle(
        queue.get(key)!,
        rows.then((found) => found[key] ?? notFound(key)),
      );
    }
  }
}
