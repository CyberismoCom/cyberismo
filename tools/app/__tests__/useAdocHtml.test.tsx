// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAdocHtml } from '@/lib/hooks/useAdocHtml';

const html = (cardKey: string, adoc: string) => `<p>${cardKey}:${adoc}</p>`;
const id = (cardKey: string, adoc: string) => `${cardKey}:${adoc}`;

// Conversions resolve only when a test says so; resolved ones are cached.
const pending = new Map<string, () => void>();
const cache = new Map<string, string>();

vi.mock('@/lib/asciidoc', () => ({
  cachedAdocHtml: (adoc: string, cardKey: string) =>
    cache.get(id(cardKey, adoc)),
  adocToHtml: (adoc: string, cardKey: string) =>
    new Promise<string>((resolve) => {
      pending.set(id(cardKey, adoc), () => {
        cache.set(id(cardKey, adoc), html(cardKey, adoc));
        resolve(html(cardKey, adoc));
      });
    }),
}));

type Props = { adoc: string; cardKey: string };

const resolve = (cardKey: string, adoc: string) =>
  act(async () => pending.get(id(cardKey, adoc))!());

const render = (initialProps: Props) =>
  renderHook((p: Props) => useAdocHtml(p.adoc, p.cardKey), { initialProps });

describe('useAdocHtml', () => {
  beforeEach(() => {
    pending.clear();
    cache.clear();
  });

  const rows: {
    name: string;
    cached: boolean;
    next: Props;
    whilePending: string;
  }[] = [
    {
      name: 'same card, new content keeps the previous html',
      cached: false,
      next: { adoc: 'two', cardKey: 'a' },
      whilePending: html('a', 'one'),
    },
    {
      name: 'same card opened from cache, new content keeps the cached html',
      cached: true,
      next: { adoc: 'two', cardKey: 'a' },
      whilePending: html('a', 'one'),
    },
    {
      name: 'different card is blank until it resolves',
      cached: false,
      next: { adoc: 'two', cardKey: 'b' },
      whilePending: '',
    },
  ];

  it.each(rows)('$name', async ({ cached, next, whilePending }) => {
    if (cached) cache.set(id('a', 'one'), html('a', 'one'));
    const hook = render({ adoc: 'one', cardKey: 'a' });
    if (!cached) await resolve('a', 'one');
    expect(hook.result.current).toBe(html('a', 'one'));

    hook.rerender(next);
    expect(hook.result.current).toBe(whilePending);
    await resolve(next.cardKey, next.adoc);
    expect(hook.result.current).toBe(html(next.cardKey, next.adoc));
  });
});
