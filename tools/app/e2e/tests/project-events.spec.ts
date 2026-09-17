import { test, expect } from '../fixtures.js';
import { editPage } from '../helpers.js';
import t from '../../src/locales/en/translation.json' with { type: 'json' };

const whileEditing = t.cardUpdated.whileEditing.replace('{{name}}', 'Bob');
const byOther = t.cardUpdated.byOther.replace('{{name}}', 'Bob');

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
    const bobTab = await bob.newPage();
    await bobTab.goto('/');
    await expect(bobTab).toHaveURL(/\/projects\//);
    const prefix = bobTab.url().split('/projects/')[1].split('/')[0];
    const createPath = `/api/projects/${prefix}/cards/root`;
    const streamPath = `/api/projects/${prefix}/events`;

    const created = await alice.request.post(createPath, {
      data: { template: 'test/templates/page' },
    });
    expect(created.ok()).toBeTruthy();
    const [card] = (await created.json()) as { key: string }[];
    const cardPath = `/projects/${prefix}/cards/${card.key}`;
    const cardApiPath = `/api/projects/${prefix}/cards/${card.key}`;

    const aliceTab = await alice.newPage();
    let streams = 0;
    aliceTab.on('request', (request) => {
      if (request.url().endsWith(streamPath)) streams++;
    });
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
    const patched = await bob.request.patch(cardApiPath, {
      data: { metadata: { title } },
    });
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
