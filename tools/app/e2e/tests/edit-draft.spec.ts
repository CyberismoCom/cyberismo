// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures.js';
import { editPage } from '../helpers.js';
import t from '../../src/locales/en/translation.json' with { type: 'json' };

// An unsaved draft must survive what the user does not see as leaving the
// card: the editor stays open and the navigation guard still asks.

let prefix: string;
let cardKey: string;

test.beforeEach(async ({ page, resetProject }) => {
  await resetProject();
  await page.goto('/');
  await expect(page).toHaveURL(/\/projects\//);
  prefix = page.url().split('/projects/')[1].split('/')[0];

  const created = await page.request.post(
    `/api/projects/${prefix}/cards/root`,
    { data: { template: 'test/templates/page' } },
  );
  expect(created.ok()).toBeTruthy();
  [{ key: cardKey }] = (await created.json()) as { key: string }[];
  await page.goto(`/projects/${prefix}/cards/${cardKey}`);

  await editPage(page);
  await page.locator('.cm-content').fill('Unsaved draft');
});

async function expectDraftGuarded(page: Page) {
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
  await expect(page).toHaveURL(new RegExp(`/cards/${cardKey}$`));
  await expect(page.locator('.cm-content')).toHaveText('Unsaved draft');
}

test('narrowing the window keeps the unsaved draft', async ({ page }) => {
  // Below the md breakpoint the tree moves into a drawer.
  await page.setViewportSize({ width: 700, height: 720 });
  await expect(page.getByText(/^Untitled page content$/)).toBeHidden();
  await expect(page.locator('.cm-content')).toHaveText('Unsaved draft');

  await page.setViewportSize({ width: 1280, height: 720 });
  await expectDraftGuarded(page);
});

test('a failed refresh keeps the unsaved draft and says so', async ({
  page,
}) => {
  // The card view's content and source reads. Its card read may go through
  // the batch endpoint instead, so it is not relied on.
  const cardApi = `/api/projects/${prefix}/cards/${cardKey}`;
  const isCardFetch = (url: URL) =>
    [`${cardApi}/content`, `${cardApi}/source`].includes(url.pathname);
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
  const notice = page.getByText(t.refreshFailed);

  await page.route(isCardFetch, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 500, body: 'unavailable' })
      : route.continue(),
  );
  await refreshCard(500);
  await expect(notice).toBeVisible();

  await page.unroute(isCardFetch);
  await refreshCard(200);
  await expect(notice).toBeHidden();

  await expectDraftGuarded(page);
});
