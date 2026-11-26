// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { test, expect } from '../fixtures.js';
import t from '../../src/locales/en/translation.json' with { type: 'json' };

// One description for each resource type, so its keys list the types.
const RESOURCE_TYPES = Object.keys(t.configOverview.descriptions);

// i18next interpolation, so a count line can be matched whole.
const interpolate = (template: string, values: Record<string, string>) =>
  template.replace(/{{(\w+)}}/g, (_, key: string) => values[key]);

test.describe('Configuration landing page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/configuration');
    await expect(page).toHaveURL(/\/projects\/[^/]+\/configuration\/?$/);
    await expect(
      page.getByRole('heading', { level: 1, name: t.configuration }),
    ).toBeVisible();
  });

  test('shows every resource type with its counts', async ({ page }) => {
    for (const resourceType of RESOURCE_TYPES) {
      await expect(
        page.getByTestId(`configOverview-${resourceType}`),
      ).toBeVisible();
    }

    const calculations = page.getByTestId('configOverview-calculations');
    await expect(calculations).toContainText(
      [
        interpolate(t.configOverview.inProject, { count: '1' }),
        interpolate(t.configOverview.fromModule, {
          count: '4',
          module: 'Cyberismo test module',
        }),
      ].join(', '),
    );
    // The tree leaves out a type with no resources; the landing page does not.
    await expect(page.getByTestId('configOverview-skills')).toContainText(
      t.configOverview.none,
    );
  });

  test('opens a resource type from its tile', async ({ page }) => {
    await page.getByTestId('configOverview-cardTypes').click();
    await expect(page).toHaveURL(/\/configuration\/cardTypes$/);
    await expect(
      page.getByRole('heading', { level: 1, name: t.resources.cardTypes }),
    ).toBeVisible();
  });

  test('opens a resource type that has no resources', async ({ page }) => {
    await page.getByTestId('configOverview-skills').click();
    await expect(page).toHaveURL(/\/configuration\/skills$/);
    await expect(
      page.getByRole('heading', { level: 1, name: t.resources.skills }),
    ).toBeVisible();
    // The project section is where an admin creates the first one.
    await expect(
      page.getByRole('button', {
        name: interpolate(t.overview.createNew, {
          resourceType: t.newResourceModal.skills.name,
        }),
      }),
    ).toBeVisible();
    await expect(page.getByText(t.invalidResource)).toHaveCount(0);
  });

  test('opens General from the project panel', async ({ page }) => {
    const general = page.getByTestId('configOverview-general');
    await expect(general).toContainText('Basic Acceptance Test');
    await general.click();
    await expect(page).toHaveURL(/\/configuration\/general$/);
  });

  test('the sidebar links back to the project', async ({ page }) => {
    await page.getByText(t.configTree.backToProject).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/cards/);
  });
});

test('the landing page reports a resource tree that fails to load', async ({
  page,
}) => {
  await page.route('**/api/projects/*/resources/tree', (route) =>
    route.fulfill({ status: 500, body: 'Resource tree failed' }),
  );
  await page.goto('/configuration');
  await expect(page.getByText('Resource tree failed')).toBeVisible();
  // A failed load must not read as a project without resources.
  await expect(page.getByTestId('configOverview-skills')).toHaveCount(0);
});
