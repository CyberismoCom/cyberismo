import { expect, afterAll, beforeAll, describe, it } from 'vitest';

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import { CardContainer } from '../src/containers/card-container.js';
import type { Card } from '../src/interfaces/project-interfaces.js';

// To allow test to populate the cache, make an inherited test class
class TestContainer extends CardContainer {
  public async populateCache() {
    return this.cardCache.populateFromPath(this.basePath);
  }
  public showCache() {
    return this.cardCache;
  }
  public async saveMetadata(card: Card) {
    return this.saveCardMetadata(card);
  }
}

describe('project', () => {
  // Create test artifacts in a temp folder.
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-card-container-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  const container = new TestContainer(decisionRecordsPath, 'decision');

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should have cards', async () => {
    await container.populateCache();
    const hasProjectCard = container.hasProjectCard('decision_5');
    const nonExistingCard = container.hasProjectCard('decision_99');
    const hasTemplateCard = container.hasTemplateCard('decision_2');
    const nonExistingTemplateCard = container.hasTemplateCard('decision_98');
    expect(hasProjectCard).toBe(true);
    expect(hasTemplateCard).toBe(true);
    expect(nonExistingCard).toBe(false);
    expect(nonExistingTemplateCard).toBe(false);
  });

  it('saveCardMetadata throws when the metadata file cannot be written', async () => {
    // A directory where index.json belongs is an unwritable target for any
    // user, root included.
    const cardFolder = join(testDir, 'unwritable-card');
    mkdirSync(join(cardFolder, 'index.json'), { recursive: true });

    await expect(
      container.saveMetadata({
        key: 'decision_5',
        path: cardFolder,
        children: [],
        attachments: [],
        metadata: {
          title: 'Decision',
          cardType: 'decision/cardTypes/decision',
          workflowState: 'Draft',
          rank: '0|a',
          links: [],
        },
      }),
    ).rejects.toThrow(/EISDIR/);
  });
});
