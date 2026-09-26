import { execSync } from 'node:child_process';
import { test as base, expect } from '../fixtures.js';
import t from '../../src/locales/en/translation.json' with { type: 'json' };

base.describe('Changesets', () => {
  base.beforeEach(async ({ resetProject, backend }) => {
    await resetProject();
    // The e2e project sits in an ignored folder of the source repository:
    // changesets need it to be a git repository of its own
    execSync(
      'git init -q && git add . && git -c user.name=E2E -c user.email=e2e@example.com commit -qm base',
      { cwd: backend.projectPath },
    );
  });

  base(
    'start a changeset, review its changes, and merge them',
    async ({ page }) => {
      await page.goto('/');
      await expect(page).toHaveURL(/\/projects\/[^/]+\/cards\/[\w-]+$/);
      const [, prefix, cardKey] = page
        .url()
        .match(/\/projects\/([^/]+)\/cards\/([\w-]+)$/)!;

      await page.getByTestId('projectMenu').click();
      await page.getByTestId('startChangeSet').click();
      await page.getByLabel(t.changeSet.titleLabel).fill('E2E changeset');
      await page.getByRole('button', { name: t.changeSet.start }).click();
      await expect(page.getByTestId('changeSetIndicator')).toContainText(
        'E2E changeset',
      );

      // An edit into the changeset, as an agent would make it
      const marker = `Edited in a changeset ${Date.now()}`;
      await page.evaluate(
        async ([prefix, cardKey, marker]) => {
          const active = await (
            await fetch(`/api/projects/${prefix}/changesets/active`)
          ).json();
          await fetch(
            `/api/projects/${prefix}/changesets/${active.changeSet.id}/cards/${cardKey}`,
            {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ content: marker }),
            },
          );
        },
        [prefix, cardKey, marker],
      );
      const inProject = async () =>
        page.evaluate(
          async ([prefix, cardKey]) =>
            await (
              await fetch(`/api/projects/${prefix}/cards/${cardKey}?raw=true`)
            ).text(),
          [prefix, cardKey],
        );
      expect(await inProject()).not.toContain(marker);

      await page.getByTestId('changeSetIndicator').click();
      await page.getByRole('menuitem', { name: t.changeSet.review }).click();
      const row = page.getByTestId('changedCard');
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(cardKey);
      await row.click();
      await expect(page.getByTestId('cardChangeDiff')).toContainText(marker);

      await page.getByTestId('mergeChangeSet').click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: t.changeSet.merge })
        .click();

      // Back on the card viewed last, in the project itself
      await expect(page).toHaveURL(new RegExp(`/cards/${cardKey}$`));
      await expect(page.getByTestId('changeSetIndicator')).toHaveCount(0);
      expect(await inProject()).toContain(marker);
    },
  );
});
