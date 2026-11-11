// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { test, expect } from '../fixtures.js';

const section = (n: number, tail = '') =>
  `== Section ${n}\n\n` +
  Array.from(
    { length: 8 },
    (_, i) => `Paragraph ${n}.${i} ${'lorem ipsum dolor sit amet '.repeat(12)}`,
  ).join('\n\n') +
  `\n\n${tail}\n\n`;

const body = (tail: string) =>
  Array.from({ length: 12 }, (_, i) => section(i + 1, i === 11 ? tail : ''))
    .join('')
    .trim();

test('refetched content keeps scroll position and text selection', async ({
  page,
  resetProject,
}) => {
  await resetProject();
  await page.goto('/');
  await expect(page).toHaveURL(/\/projects\//);
  const prefix = page.url().split('/projects/')[1].split('/')[0];
  const created = await page.request.post(
    `/api/projects/${prefix}/cards/root`,
    { data: { template: 'test/templates/page' } },
  );
  expect(created.ok()).toBeTruthy();
  const [card] = (await created.json()) as { key: string }[];
  const cardApiPath = `/api/projects/${prefix}/cards/${card.key}`;

  const write = async (tail: string) => {
    const res = await page.request.patch(cardApiPath, {
      data: { content: body(tail) },
    });
    expect(res.ok()).toBeTruthy();
  };
  await write('first ending');

  await page.goto(`/projects/${prefix}/cards/${card.key}`);
  await expect(page.getByText('first ending')).toBeAttached();

  // Scroll into the middle of a section and select a paragraph there.
  const target = page.getByText('Paragraph 6.3', { exact: false });
  await target.scrollIntoViewIfNeeded();
  await target.evaluate((el) => {
    const scroller = (() => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        if (n.scrollHeight > n.clientHeight + 1) {
          const overflow = getComputedStyle(n).overflowY;
          if (overflow === 'auto' || overflow === 'scroll') return n;
        }
      }
      return document.scrollingElement!;
    })();
    scroller.scrollTop += 40;
    (window as unknown as { __scroller: Element }).__scroller = scroller;
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  const state = () =>
    page.evaluate(() => ({
      top: (window as unknown as { __scroller: Element }).__scroller.scrollTop,
      selected: window.getSelection()!.toString(),
    }));
  const before = await state();
  expect(before.top).toBeGreaterThan(500);
  expect(before.selected).toContain('Paragraph 6.3');

  const refetched = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      r.url().includes(`${cardApiPath}/content`),
  );
  await write('second ending');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refetched;
  await expect(page.getByText('second ending')).toBeAttached();

  const after = await state();
  expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(2);
  expect(after.selected).toContain('Paragraph 6.3');
});
