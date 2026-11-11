// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { test, expect } from '../fixtures.js';
import { editPage } from '../helpers.js';
import t from '../../src/locales/en/translation.json' with { type: 'json' };

// A refresh of the open card that fails (backend restart, network drop) must
// not close the editor, drop the unsaved draft or lift the navigation guard.
test('a failed refresh keeps the unsaved draft and the navigation guard', async ({
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
  await page.goto(`/projects/${prefix}/cards/${card.key}`);

  await editPage(page);
  await page.locator('.cm-content').fill('Unsaved draft');

  // The card itself, its content and its source: the three fetches behind the
  // card view.
  const cardApi = `/api/projects/${prefix}/cards/${card.key}`;
  const isCardFetch = (url: URL) =>
    [cardApi, `${cardApi}/content`, `${cardApi}/source`].includes(url.pathname);
  // SWR refetches on window focus, but drops refetches that come within its
  // deduping interval, so keep focusing until the card is fetched.
  const refreshCard = (status: number) =>
    expect(async () => {
      const fetched = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          isCardFetch(new URL(response.url())) &&
          response.status() === status,
        { timeout: 1_000 },
      );
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await fetched;
    }).toPass({ timeout: 20_000 });

  await page.route(isCardFetch, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 500, body: 'unavailable' })
      : route.continue(),
  );
  await refreshCard(500);
  await page.unroute(isCardFetch);
  await refreshCard(200);

  await expect(page.locator('.cm-content')).toHaveText('Unsaved draft');

  const dialog = page.waitForEvent('dialog', { timeout: 10_000 });
  // Open another card from the tree, which the in-app guard intercepts.
  await page
    .locator('p')
    .filter({ hasText: /^Untitled page content$/ })
    .click();
  const guard = await dialog;
  expect(guard.message()).toBe(t.navigationDialogMsg);
  await guard.dismiss();
  await expect(page).toHaveURL(new RegExp(`/cards/${card.key}$`));
  await expect(page.locator('.cm-content')).toHaveText('Unsaved draft');
});
