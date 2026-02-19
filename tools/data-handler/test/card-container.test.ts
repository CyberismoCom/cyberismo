// testing
import { expect } from 'chai';
import { after, before, describe, it } from 'mocha';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import { CardContainer } from '../src/containers/card-container.js';

// To allow test to populate the cache, make an inherited test class
class TestContainer extends CardContainer {
  public async populateCache() {
    return this.cardCache.populateFromPath(this.basePath);
  }
  public showCache() {
    return this.cardCache;
  }
}

describe('project', () => {
  // Create test artifacts in a temp folder.
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-card-container-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  const container = new TestContainer(decisionRecordsPath, 'decision');

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should have cards', async () => {
    await container.populateCache();
    const hasProjectCard = container.hasProjectCard('decision_5');
    const nonExistingCard = container.hasProjectCard('decision_99');
    const hasTemplateCard = container.hasTemplateCard('decision_2');
    const nonExistingTemplateCard = container.hasProjectCard('decision_98');
    expect(hasProjectCard).to.equal(true);
    expect(hasTemplateCard).to.equal(true);
    expect(nonExistingCard).to.equal(false);
    expect(nonExistingTemplateCard).to.equal(false);
  });
});
