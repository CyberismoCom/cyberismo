// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAdocHtml } from '@/lib/hooks/useAdocHtml';

const pending = new Map<string, (html: string) => void>();

vi.mock('@/lib/asciidoc', () => ({
  cachedAdocHtml: (adoc: string) => (adoc ? undefined : ''),
  adocToHtml: (adoc: string, cardKey: string) =>
    new Promise<string>((resolve) => {
      pending.set(`${cardKey}:${adoc}`, resolve);
    }),
}));

type Props = { adoc: string; cardKey: string };

const resolve = (cardKey: string, adoc: string) =>
  act(async () => {
    pending.get(`${cardKey}:${adoc}`)!(`<p>${cardKey}:${adoc}</p>`);
  });

describe('useAdocHtml', () => {
  beforeEach(() => pending.clear());

  const settled = async () => {
    const hook = renderHook((p: Props) => useAdocHtml(p.adoc, p.cardKey), {
      initialProps: { adoc: 'one', cardKey: 'a' },
    });
    await resolve('a', 'one');
    expect(hook.result.current).toBe('<p>a:one</p>');
    return hook;
  };

  const rows: {
    name: string;
    next: Props;
    whilePending: string;
    afterResolve: string;
  }[] = [
    {
      name: 'same card, new content keeps the previous html',
      next: { adoc: 'two', cardKey: 'a' },
      whilePending: '<p>a:one</p>',
      afterResolve: '<p>a:two</p>',
    },
    {
      name: 'different card is blank until it resolves',
      next: { adoc: 'two', cardKey: 'b' },
      whilePending: '',
      afterResolve: '<p>b:two</p>',
    },
  ];

  it.each(rows)('$name', async ({ next, whilePending, afterResolve }) => {
    const hook = await settled();
    hook.rerender(next);
    expect(hook.result.current).toBe(whilePending);
    await resolve(next.cardKey, next.adoc);
    expect(hook.result.current).toBe(afterResolve);
  });

  it('a stale resolve after a switch does not paint', async () => {
    const hook = await settled();
    hook.rerender({ adoc: 'two', cardKey: 'a' });
    hook.rerender({ adoc: 'two', cardKey: 'b' });
    await resolve('a', 'two');
    expect(hook.result.current).toBe('');
    await resolve('b', 'two');
    expect(hook.result.current).toBe('<p>b:two</p>');
  });
});
