import { createServer, type Server } from 'node:http';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures.js';
import t from '../../src/locales/en/translation.json' with { type: 'json' };

test.describe.configure({ mode: 'serial' });

const HUB_DISPLAY_NAME = 'Local test hub';

// Module locations are never cloned by this spec, only listed.
const HUB_PAYLOAD = {
  description: 'Hub served by the e2e test',
  displayName: HUB_DISPLAY_NAME,
  modules: [
    {
      name: 'base',
      displayName: 'Base test module',
      location: 'https://example.invalid/module-base.git',
    },
    {
      name: 'extra',
      displayName: 'Extra test module',
      location: 'https://example.invalid/module-extra.git',
    },
  ],
  version: 1,
};

// Nothing listens on port 1, so the backend's fetch of it fails at once.
const UNREACHABLE_HUB = 'http://127.0.0.1:1/';

// Hubs are fetched by the backend, not the browser, so the hub is served from
// this process instead of being mocked as a page route.
async function startHubServer(): Promise<{ server: Server; location: string }> {
  const server = createServer((_req, res) => {
    res.writeHead(200, {
      'content-type': 'application/json',
      // Otherwise the backend's keep-alive socket holds the server open on close.
      connection: 'close',
    });
    res.end(JSON.stringify(HUB_PAYLOAD));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Hub server did not report a port');
  }
  // An ephemeral port keeps parallel workers from serving each other's hub.
  return { server, location: `http://127.0.0.1:${address.port}/` };
}

// i18next interpolation, so an interpolated toast can be matched whole.
const interpolate = (template: string, values: Record<string, string>) =>
  template.replace(/{{(\w+)}}/g, (_, key: string) => values[key]);

const hubCard = (page: Page, text: string) =>
  page.getByTestId('hubCard').filter({ hasText: text });

const moduleTile = (card: Locator, name: string) =>
  card
    .getByTestId('hubModuleCard')
    .filter({ hasText: `${t.general.cardKeyPrefix}: ${name}` });

async function dismissToast(page: Page, message: string) {
  const toast = page.getByRole('presentation').filter({ hasText: message });
  await expect(toast).toBeVisible();
  await toast.getByTestId('notificationClose').click();
  await expect(toast).toHaveCount(0);
}

async function addHub(page: Page, location: string) {
  await page.getByPlaceholder(t.general.hubLocationUrl).fill(location);
  await page.getByTestId('addHubButton').click();
}

async function deleteHub(page: Page, card: Locator) {
  await card.getByTestId('deleteHubButton').click();
  await page.getByTestId('confirmDeleteHubButton').click();
}

const updateHubsButton = (page: Page) =>
  page.getByRole('button', { name: t.general.updateHubs });

test.describe('Hubs', () => {
  let hubServer: Server;
  let hubLocation: string;

  test.beforeAll(async ({ resetProject }) => {
    await resetProject();
    ({ server: hubServer, location: hubLocation } = await startHubServer());
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      hubServer.close((error) => (error ? reject(error) : resolve()));
    });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/configuration/general');
    await expect(page).toHaveURL(/\/projects\/[^/]+\/configuration\/general$/);
    await expect(
      page.getByRole('heading', { level: 2, name: t.general.hubsSection }),
    ).toBeVisible();
  });

  test('a project without hubs offers nothing to update', async ({ page }) => {
    await expect(page.getByText(t.noHubs)).toBeVisible();
    await expect(updateHubsButton(page)).toHaveCount(0);
  });

  test('adding a hub lists the modules it offers', async ({ page }) => {
    await addHub(page, hubLocation);
    await dismissToast(page, t.general.addHubSuccess);

    const card = hubCard(page, HUB_DISPLAY_NAME);
    await expect(
      card.getByRole('heading', { level: 3, name: HUB_DISPLAY_NAME }),
    ).toBeVisible();
    await expect(card.getByText(hubLocation)).toBeVisible();
    await expect(card.getByText(t.general.noHubModules)).toHaveCount(0);
    await expect(page.getByText(t.noHubs)).toHaveCount(0);
    await expect(updateHubsButton(page)).toBeVisible();

    const base = moduleTile(card, 'base');
    await expect(base.getByText('Base test module')).toBeVisible();
    await expect(
      base.getByRole('button', { name: t.general.addModule }),
    ).toBeVisible();
    await expect(
      moduleTile(card, 'extra').getByText('Extra test module'),
    ).toBeVisible();
  });

  test('an unreachable hub is reported but still added', async ({ page }) => {
    await addHub(page, UNREACHABLE_HUB);
    await dismissToast(
      page,
      interpolate(t.general.hubsUnreachable, { hubs: UNREACHABLE_HUB }),
    );

    const broken = hubCard(page, UNREACHABLE_HUB);
    await expect(broken).toHaveCount(1);
    await expect(broken.getByText(t.general.noHubModules)).toBeVisible();
    await expect(hubCard(page, HUB_DISPLAY_NAME)).toHaveCount(1);
  });

  test('updating hubs reports the one that cannot be read', async ({
    page,
  }) => {
    await updateHubsButton(page).click();
    await dismissToast(
      page,
      interpolate(t.general.hubsUnreachable, { hubs: UNREACHABLE_HUB }),
    );
    await expect(
      moduleTile(hubCard(page, HUB_DISPLAY_NAME), 'base'),
    ).toHaveCount(1);
  });

  test('removing the unreachable hub makes an update succeed', async ({
    page,
  }) => {
    await deleteHub(page, hubCard(page, UNREACHABLE_HUB));
    await dismissToast(
      page,
      interpolate(t.deleteHubModal.success, { hubName: UNREACHABLE_HUB }),
    );
    await expect(hubCard(page, UNREACHABLE_HUB)).toHaveCount(0);

    await updateHubsButton(page).click();
    await dismissToast(page, t.general.updateHubsSuccess);
  });

  test('removing the last hub restores the empty state', async ({ page }) => {
    await deleteHub(page, hubCard(page, HUB_DISPLAY_NAME));
    await dismissToast(
      page,
      interpolate(t.deleteHubModal.success, { hubName: HUB_DISPLAY_NAME }),
    );
    await expect(page.getByText(t.noHubs)).toBeVisible();
    await expect(updateHubsButton(page)).toHaveCount(0);
  });
});
