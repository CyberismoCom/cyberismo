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

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from '../fixtures.js';

test.use({ presenceEnabled: true });

test('project events notify two users and preserve normal and template drafts', async ({
  browser,
  backend,
  resetProject,
}) => {
  await resetProject();
  const alice = await browser.newContext({ baseURL: backend.baseURL });
  const bob = await browser.newContext({ baseURL: backend.baseURL });
  try {
    await alice.addCookies([
      { name: 'mock-user', value: 'alice', url: backend.baseURL },
    ]);
    await bob.addCookies([
      { name: 'mock-user', value: 'bob', url: backend.baseURL },
    ]);
    const create = await alice.request.post('/api/projects/bat/cards/root', {
      data: { template: 'test/templates/page' },
    });
    expect(create.ok()).toBeTruthy();
    const [card] = (await create.json()) as { key: string }[];
    const a = await alice.newPage();
    const b = await bob.newPage();
    let connections = 0;
    a.on('request', (request) => {
      if (request.url().endsWith('/api/projects/bat/events')) connections++;
    });
    await a.goto(`/projects/bat/cards/${card.key}`);
    await b.goto(`/projects/bat/cards/${card.key}`);
    await expect(a.getByText('B', { exact: true })).toBeVisible();
    await a.getByTestId('editBodyButton').click();
    await a.locator('.cm-content').fill('Alice unsaved draft');
    await b.getByTestId('editBodyButton').click();
    await b.locator('.cm-content').fill('Bob saved content');
    const refreshed = a.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().endsWith(`/cards/${card.key}`),
    );
    await b.getByTestId('contentSaveButton').click();
    await refreshed;
    await expect(
      a.getByText(
        'Bob saved changes to this card while you are editing. Your draft is unchanged.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(a.locator('.cm-content')).toHaveText('Alice unsaved draft');
    await a.getByTestId('contentCancelButton').click();
    await expect(
      a.getByText('Bob saved content', { exact: true }),
    ).toBeVisible();
    expect(connections).toBe(1);

    // Metadata changes refresh the open card without changing routes.
    const title = 'Remote project tree update';
    const updated = await bob.request.patch(
      `/api/projects/bat/cards/${card.key}`,
      { data: { metadata: { title } } },
    );
    expect(updated.ok()).toBeTruthy();
    await expect(
      a.getByRole('heading', { level: 1, name: title }),
    ).toBeVisible();
    await expect(
      a.getByText('Bob updated this card', { exact: true }),
    ).toBeVisible();
    expect(connections).toBe(1);

    const { localTemplateCardKey } = JSON.parse(
      await readFile(
        join(import.meta.dirname, '..', 'assets', 'e2e-keys.json'),
        'utf8',
      ),
    ) as { localTemplateCardKey: string };
    await a.goto(
      `/projects/bat/configuration/bat/cards/${localTemplateCardKey}`,
    );
    await expect(a.getByTestId('contentEditor')).toBeVisible();
    await a
      .getByTestId('contentEditor')
      .locator('.cm-content')
      .fill('Template unsaved draft');
    const templateRefresh = a.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().includes(`/cards/${localTemplateCardKey}`),
    );
    // Use another admin session for configuration writes.
    await bob.addCookies([
      { name: 'mock-role', value: 'admin', url: backend.baseURL },
    ]);
    const templateUpdate = await bob.request.patch(
      `/api/projects/bat/cards/${localTemplateCardKey}`,
      { data: { content: 'Template remote content' } },
    );
    expect(templateUpdate.ok()).toBeTruthy();
    await templateRefresh;
    await expect(
      a.getByTestId('contentEditor').locator('.cm-content'),
    ).toHaveText('Template unsaved draft');
    await a
      .getByTestId('contentEditor')
      .getByTestId('contentCancelButton')
      .click();
    await expect(
      a.getByTestId('contentEditor').locator('.cm-content'),
    ).toHaveText('Template remote content');
  } finally {
    await alice.close();
    await bob.close();
  }
});
