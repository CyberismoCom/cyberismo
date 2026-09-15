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

import { test, expect } from '../fixtures.js';
import { editPage } from '../helpers.js';
import t from '../../src/locales/en/translation.json' with { type: 'json' };

const whileEditing = t.presence.updatedWhileEditing.replace('{{user}}', 'Bob');
const byOther = t.presence.updatedByOther.replace('{{user}}', 'Bob');

test.use({ presenceEnabled: true });

test('a card write reaches the other users viewing that card', async ({
  browser,
  backend,
  resetProject,
}) => {
  await resetProject();
  const [alice, bob, carol] = await Promise.all(
    ['alice', 'bob', 'carol'].map(async (user) => {
      const context = await browser.newContext({ baseURL: backend.baseURL });
      await context.addCookies([
        { name: 'mock-user', value: user, url: backend.baseURL },
      ]);
      return context;
    }),
  );
  try {
    const created = await alice.request.post('/api/projects/bat/cards/root', {
      data: { template: 'test/templates/page' },
    });
    expect(created.ok()).toBeTruthy();
    const [card] = (await created.json()) as { key: string }[];
    const cardPath = `/projects/bat/cards/${card.key}`;

    const aliceTab = await alice.newPage();
    let streams = 0;
    aliceTab.on('request', (request) => {
      if (request.url().endsWith('/api/projects/bat/events')) streams++;
    });
    const bobTab = await bob.newPage();
    const carolTab = await carol.newPage();
    await aliceTab.goto(cardPath);
    await carolTab.goto(cardPath);
    await bobTab.goto(cardPath);

    await editPage(aliceTab);
    await aliceTab.locator('.cm-content').fill('Alice unsaved draft');
    await editPage(bobTab);
    await bobTab.locator('.cm-content').fill('Bob saved content');
    const refetched = aliceTab.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().endsWith(`/cards/${card.key}`),
    );
    await bobTab.getByTestId('contentSaveButton').click();
    await refetched;

    await expect(
      aliceTab.getByText(whileEditing, { exact: true }),
    ).toBeVisible();
    await expect(aliceTab.locator('.cm-content')).toHaveText(
      'Alice unsaved draft',
    );
    await aliceTab.getByTestId('contentCancelButton').click();
    await expect(
      aliceTab.getByText('Bob saved content', { exact: true }),
    ).toBeVisible();
    expect(streams).toBe(1);

    const title = 'Renamed through the API';
    const patched = await bob.request.patch(
      `/api/projects/bat/cards/${card.key}`,
      { data: { metadata: { title } } },
    );
    expect(patched.ok()).toBeTruthy();
    await expect(
      aliceTab.getByRole('heading', { level: 1, name: title }),
    ).toBeVisible();
    await expect(
      aliceTab
        .locator('.breadcrumbs')
        .getByRole('link', { name: `${title} - ${card.key}` }),
    ).toBeVisible();
    await expect(aliceTab.getByText(byOther, { exact: true })).toBeVisible();

    await expect(
      carolTab.getByRole('heading', { level: 1, name: title }),
    ).toBeVisible();
    await expect(carolTab.getByText(byOther, { exact: true })).toHaveCount(0);
  } finally {
    await Promise.all([alice.close(), bob.close(), carol.close()]);
  }
});
