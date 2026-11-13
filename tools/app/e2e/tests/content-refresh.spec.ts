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

test('a content refresh keeps the text selection', async ({
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

  const target = page.getByText('Paragraph 6.3', { exact: false });
  await target.scrollIntoViewIfNeeded();
  await target.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  });
  const selection = () =>
    page.evaluate(() => window.getSelection()!.toString());
  expect(await selection()).toContain('Paragraph 6.3');

  // The write reaches the open card through the project event stream.
  await write('second ending');
  await expect(page.getByText('second ending')).toBeAttached();

  // A remounted body drops the selection.
  expect(await selection()).toContain('Paragraph 6.3');
});
