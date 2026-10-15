import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Checkout } from '../../../src/infra/checkout/checkout.js';
import { copyDir } from '../../../src/shared/utils/file-utils.js';
import { renameProjectPrefix } from '../../../src/api/directory/prefix-rename.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-project-rename');

describe('renameProjectPrefix', () => {
  let checkout: Checkout;

  beforeEach(async () => {
    const projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    checkout = new Checkout(projectPath);
    await checkout.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('apply rewrites cardType references in every card', async () => {
    const oldPrefix = checkout.projectPrefix;
    const newPrefix = 'renamed';
    await renameProjectPrefix(checkout, newPrefix);

    expect(checkout.projectPrefix).toBe(newPrefix);

    for (const card of checkout.cardTree.cards()) {
      // Cards that referenced cardTypes under oldPrefix must now reference newPrefix.
      if (card.metadata?.cardType?.startsWith(`${oldPrefix}/`)) {
        expect.fail(`card '${card.key}' still references old prefix`);
      }
    }
  });

  it('apply rewrites resource references in card content adoc files', async () => {
    const oldPrefix = checkout.projectPrefix;
    const newPrefix = 'renamed';
    await renameProjectPrefix(checkout, newPrefix);

    for (const card of checkout.cardTree.cards()) {
      const adoc = join(card.path, 'index.adoc');
      let content: string;
      try {
        content = await readFile(adoc, 'utf-8');
      } catch {
        continue;
      }
      // No remaining "<oldPrefix>/<resourceType>/" substring (the strict
      // cascade pattern that updateFiles uses).
      for (const type of [
        'calculations',
        'cardTypes',
        'fieldTypes',
        'linkTypes',
        'reports',
        'templates',
        'workflows',
      ]) {
        expect(content).not.toContain(`${oldPrefix}/${type}/`);
      }
    }
  });

  it('apply rewrites internal references of card types and link types', async () => {
    const newPrefix = 'renamed';
    await renameProjectPrefix(checkout, newPrefix);

    const cardType = checkout.resources
      .byType(`${newPrefix}/cardTypes/decision`, 'cardTypes')
      .show();
    expect(cardType.workflow).toBe(`${newPrefix}/workflows/decision`);
    for (const field of cardType.customFields) {
      expect(field.name.startsWith(`${newPrefix}/fieldTypes/`)).toBe(true);
    }

    const linkType = checkout.resources
      .byType(`${newPrefix}/linkTypes/testTypes`, 'linkTypes')
      .show();
    expect(linkType.sourceCardTypes).toEqual([
      `${newPrefix}/cardTypes/decision`,
    ]);
    expect(linkType.destinationCardTypes).toEqual([
      `${newPrefix}/cardTypes/simplepage`,
    ]);
  });

  it('apply renames cards whose key starts with the old prefix', async () => {
    const oldPrefix = checkout.projectPrefix;
    const newPrefix = 'renamed';
    await renameProjectPrefix(checkout, newPrefix);

    for (const card of checkout.cardTree.cards()) {
      expect(card.key.startsWith(`${oldPrefix}_`)).toBe(false);
    }
  });

  it('throws when renaming to the current prefix', async () => {
    const current = checkout.projectPrefix;
    await expect(renameProjectPrefix(checkout, current)).rejects.toThrow(
      `Project prefix is already '${current}'`,
    );
  });

  it('throws for an invalid prefix', async () => {
    // Underscore is not a valid prefix character (setCardPrefix rejects it).
    await expect(renameProjectPrefix(checkout, 'bad_prefix')).rejects.toThrow();
  });
});
